import { useCallback, useMemo } from "react";
import type { z } from "zod";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import {
  type ArrayOpRecord,
  arrayOpsFor,
  clearArrayOps,
} from "../core/arrayOpLog";
import type { Form } from "../core/createForm";
import { isFieldDirty } from "../core/equality";
import type {
  ArrayFieldPath,
  ArrayItemOf,
  DefaultPathDepth,
  FieldValue,
  PathDepth,
} from "../core/fieldPath";
import { entryAt, flagAt } from "../core/maps";
import { shouldValidateOn } from "../core/mode";
import { getAtPath } from "../core/path";
import type { FormState } from "../core/types";
import type { FieldValidationResult } from "../core/validation";
import type { FieldPathArg } from "./useField";

type ReadonlyStore<T> = Pick<
  StoreApi<T>,
  "getState" | "getInitialState" | "subscribe"
>;

// Method (shorthand) syntax on purpose: method parameters are checked
// bivariantly, so a Form<TSchema> — whose array ops take the narrower
// FieldPath<...> instead of string — still satisfies this API.
// NOTE for custom implementations: exact row-id tracking for ops on
// Object.is-equal rows is a createForm feature (its ops record their index
// mappings internally) — a hand-rolled implementation of these methods gets
// value-based id reconciliation only.
export type FieldArrayFormApi = Readonly<{
  store: ReadonlyStore<FormState<unknown>>;
  arrayPush(path: string, item: unknown): void;
  arrayRemove(path: string, index: number): void;
  arrayInsert(path: string, index: number, item: unknown): void;
  arrayMove(path: string, from: number, to: number): void;
  arraySwap(path: string, a: number, b: number): void;
  // OPTIONAL, probed before use: when present (createForm always provides
  // it), the hook's op wrappers revalidate the array path after an op under
  // the same change-trigger gate useField.setValue applies — so a visible
  // array-level error (z.array().min()) tracks push/remove instead of going
  // stale. NOTE for custom implementations: a hand-rolled FieldArrayFormApi
  // without this member still works — the ops simply skip revalidation.
  validateField?(path: string): FieldValidationResult;
  // OPTIONAL like validateField, same custom-implementation contract: when
  // present (createForm always provides them), the hook exposes the
  // array-level server-error channel — a "too many rows" verdict from the
  // API is set and cleared from the hook that owns the array, the same
  // symmetry useField has had all along. Absent members make the returned
  // setError/clearError no-ops.
  setError?(path: string, errors: string | readonly string[]): void;
  clearErrors?(path?: string): void;
  // OPTIONAL, same contract: `setTouched` backs the hook's touched/onBlur
  // half of its useField parity, `setValue` backs the whole-array writes
  // (replace/update/clear). Absent members make those returned functions
  // no-ops, like setError/clearError above.
  setTouched?(path: string, touched?: boolean): void;
  setValue?(path: string, value: unknown): void;
}>;

export type FieldArrayEntry<TItem> = Readonly<{
  id: string;
  value: TItem;
}>;

export type UseFieldArrayReturn<TItem> = Readonly<{
  // The resolved array path — the same convenience useField exposes.
  path: string;
  fields: readonly FieldArrayEntry<TItem>[];
  items: readonly TItem[];
  length: number;
  error: readonly string[] | undefined;
  // The first array-level message, or undefined — same shorthand as
  // useField.firstError (the docs used to hand-roll error[0] here).
  firstError: string | undefined;
  // The array-level server channel, scoped to this path (see the
  // FieldArrayFormApi note: no-ops on custom implementations without the
  // optional members).
  setError: (errors: string | readonly string[]) => void;
  clearError: () => void;
  // The array's own flags, read at ITS path like useField reads a leaf's:
  // `touched` is the array path's flag (set by onBlur/setTouched, not by
  // a row's blur), `dirty` compares the whole array against its initial
  // value, `isValidating` is the array path's in-flight flag. A "touched
  // array" UI used to drop to selectors for these.
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
  setTouched: (touched?: boolean) => void;
  // Marks the array touched and validates it under the blur gate, the
  // same gate useField.onBlur applies; for a list whose "control" is the
  // add row or the group as a whole.
  onBlur: () => void;
  // Array-scoped validation, the same result shape as useField.validate.
  // On a hand-rolled FieldArrayFormApi without validateField it reports
  // valid without running anything (the member is optional, see above).
  validate: () => FieldValidationResult;
  push: (item: TItem) => void;
  remove: (index: number) => void;
  insert: (index: number, item: TItem) => void;
  move: (from: number, to: number) => void;
  swap: (a: number, b: number) => void;
  // The whole-array writes. `replace` and `clear` go through the form's
  // setValue, so ids come from reconciliation: a row REFERENCE that
  // survives keeps its id, a fresh row at the same index keeps that
  // index's id. `update` writes one row in place (the row keeps its id,
  // an edit at the same index), `prepend` is insert(0, item). All four
  // revalidate under the change gate like the index ops.
  replace: (items: readonly TItem[]) => void;
  update: (index: number, item: TItem) => void;
  prepend: (item: TItem) => void;
  clear: () => void;
}>;

type IdState = Readonly<{
  items: readonly unknown[];
  ids: readonly string[];
  counter: number;
  // Unique per (form, path) entry, so ids minted for different arrays (or
  // for the same hook after a dynamic path switch) can never collide as
  // React keys.
  prefix: string;
}>;

// Stable reference for "path holds no array yet" — a fresh [] per selector
// run would defeat useShallow and re-render on every store change.
const EMPTY_ITEMS: readonly never[] = [];

// 1-based mint numbers for the positions needing a fresh id, in order.
// BOTH id-derivation paths (value reconciliation in reconcileIds and the
// exact op mappings in mappedIdState) number their mints through this one
// helper, so the collision-free scheme — counter + consecutive 1-based
// counts, counter advanced by the map's size — cannot diverge between them.
const mintNumbers = (
  needsMint: readonly boolean[],
): ReadonlyMap<number, number> =>
  new Map(
    needsMint
      .flatMap((mint, i) => (mint ? [i] : []))
      .map((position, k) => [position, k + 1] as const),
  );

// Derive a stable id per item by reconciling the live items against the
// last-seen items. Ids follow items by identity/value, so resets and
// mutations that bypass the array ops (setValue of a whole array, restore)
// keep keys glued to their rows — not just length-preserving appends/
// truncations. A same-index fallback keeps an edited row's id (editing
// produces a fresh item reference at the same position) without remounting
// it. This is the FALLBACK path: array ops (hook-issued OR imperative)
// replay their exact recorded mappings via the core's op log first (see
// deriveIds), because value matching cannot tell Object.is-equal rows
// apart.
const reconcileIds = (prev: IdState, nextItems: readonly unknown[]): IdState => {
  if (prev.items === nextItems) return prev;
  if (
    prev.items.length === nextItems.length &&
    prev.items.every((item, i) => Object.is(item, nextItems[i]))
  ) {
    // Same rows, fresh array reference (a normalization pass, a server
    // refresh of unchanged data): the ids are unchanged but the anchor
    // MUST move to the live reference — a later op's record chains from
    // it, and a stale anchor would silently break replay back to value
    // matching (the duplicate-row bug all over again).
    return { ...prev, items: nextItems };
  }

  // Zeroth pass: a row that is Object.is-equal AT ITS OWN INDEX keeps its
  // own id before any value matching runs. Without this, duplicate
  // primitives steal each other's ids on an edit: with ["", ""] and a
  // keystroke into row 0 (["x", ""]), the value pass below would hand row
  // 0's id to row 1 (the first "" bucket slot), row 0 would then mint, and
  // React would remount the input the user is typing in. Reserving
  // same-index identity first keeps row 1 on its own id and leaves row 0's
  // slot for the same-index leftover pass, which is what an edit needs.
  const keptAtIndex: readonly boolean[] = nextItems.map(
    (item, i) => i < prev.items.length && Object.is(item, prev.items[i]),
  );

  // Bucket the REMAINING prev positions by item so duplicate primitives
  // match in order.
  const buckets = prev.items.reduce<Map<unknown, number[]>>((acc, item, i) => {
    if (keptAtIndex[i] === true) return acc;
    const bucket = acc.get(item);
    if (bucket === undefined) {
      acc.set(item, [i]);
    } else {
      bucket.push(i);
    }
    return acc;
  }, new Map());

  // First pass: reuse the id of the matching prev item, consuming that slot so
  // each id is reused at most once (`shift` empties the bucket as we go).
  const matchedIds: readonly (string | null)[] = nextItems.map((item, i) => {
    if (keptAtIndex[i] === true) return prev.ids[i] ?? null;
    const prevIndex = buckets.get(item)?.shift();
    return prevIndex === undefined ? null : (prev.ids[prevIndex] ?? null);
  });

  // Second pass: an unmatched item reuses its SAME-INDEX leftover id (an
  // in-place edit keeps its row); any other leftover id belongs to a row
  // that is genuinely gone. Handing those out positionally would let a
  // remove-then-push in one batch key the new row with the deleted row's
  // id — a React reorder that resurrects the dead row's DOM state — so
  // they die and new items mint fresh ids instead. (Trade-off: an edit
  // that also MOVES in the same write remounts; value-identity matching
  // above already covers pure moves.)
  const leftoverAt = new Map(
    [...buckets.values()].flat().flatMap((i) => {
      const id = prev.ids[i];
      return id === undefined ? [] : ([[i, id]] as const);
    }),
  );
  const reused = matchedIds.map((id, i) => id ?? leftoverAt.get(i) ?? null);

  const mints = mintNumbers(reused.map((id) => id === null));
  const ids = reused.map(
    (id, i) => id ?? `${prev.prefix}${prev.counter + (mints.get(i) ?? 0)}`,
  );

  return {
    items: nextItems,
    ids,
    counter: prev.counter + mints.size,
    prefix: prev.prefix,
  };
};

// Apply an exact index mapping to the id list: nextIds[i] =
// prev.ids[mapping[i]], with -1 minting a fresh id (a new row). Returns null
// — falling back to value reconciliation — unless every carried position's
// live item is identity-equal to the recorded previous item, so a mapping
// can never mis-key rows the store changed some other way (a refused
// out-of-bounds op, an interleaved setValue).
const mappedIdState = (
  prev: IdState,
  mapping: readonly number[],
  liveItems: readonly unknown[],
): IdState | null => {
  if (liveItems.length !== mapping.length) return null;
  const aligned = mapping.every((src, i) =>
    src === -1
      ? true
      : prev.ids[src] !== undefined &&
        Object.is(liveItems[i], prev.items[src]),
  );
  if (!aligned) return null;
  // (In practice an op mapping mints at most one row — push/insert — but
  // the numbering stays general via the shared scheme.)
  const mints = mintNumbers(mapping.map((src) => src === -1));
  const ids = mapping.map((src, i) =>
    src === -1
      ? `${prev.prefix}${prev.counter + (mints.get(i) ?? 0)}`
      : (prev.ids[src] as string),
  );
  return {
    items: liveItems,
    ids,
    counter: prev.counter + mints.size,
    prefix: prev.prefix,
  };
};

// One id state per (form store, path), shared by EVERY hook instance on
// that array so sibling hooks always agree on row ids. A sanctioned
// mutable-ref cache (like the core's subschemaCache): the entry is derived
// bookkeeping — each commit is a pure function of a REAL store state, so a
// discarded render leaves a sound (if not identical) state behind: rows may
// remint where reuse was possible (a cosmetic remount), but a surviving row
// can never receive another row's id. Entries are access-ordered and capped
// so a long-lived store with churning dynamic paths (rows.N.tags) can't
// accumulate snapshots forever; the WeakMap releases the rest with the
// store.
type SharedIdEntry = { state: IdState };
type StoreIdEntries = { byPath: Map<string, SharedIdEntry>; seq: number };

// Generous like path.ts's PARSE_CACHE_MAX: eviction of a MOUNTED array's
// entry remints every row id (a full remount), so the cap is a backstop
// against unbounded dynamic-path churn, never a working-set limit.
const MAX_ID_PATHS = 4096;
const sharedIdEntries = new WeakMap<object, StoreIdEntries>();

const storeIdEntries = (store: object): StoreIdEntries => {
  const existing = sharedIdEntries.get(store);
  const forStore = existing ?? { byPath: new Map(), seq: 1 };
  if (existing === undefined) sharedIdEntries.set(store, forStore);
  return forStore;
};

const sharedIdEntry = (
  forStore: StoreIdEntries,
  path: string,
): SharedIdEntry => {
  const existing = forStore.byPath.get(path);
  if (existing !== undefined) {
    // Re-insert to refresh recency, so eviction takes the longest-unused
    // path, not merely the oldest-created.
    forStore.byPath.delete(path);
    forStore.byPath.set(path, existing);
    return existing;
  }
  // Prefix from a PER-STORE sequence (deterministic per form, unlike a
  // module-global counter whose value depends on app-wide first-touch
  // order), so ids from different arrays — or a hook whose dynamic path
  // switches — can never collide as React keys.
  const created: SharedIdEntry = {
    state: {
      items: EMPTY_ITEMS,
      ids: [],
      counter: 0,
      prefix: `__zfa_${forStore.seq}_`,
    },
  };
  forStore.seq += 1;
  forStore.byPath.set(path, created);
  if (forStore.byPath.size > MAX_ID_PATHS) {
    const oldest = forStore.byPath.keys().next().value;
    if (oldest !== undefined) forStore.byPath.delete(oldest);
  }
  return created;
};

// Walk EVERY record in order, applying its exact mapping. A gap before a
// record (a chain-breaking write between ops — though the core now clears
// records at such writes, so gaps are rare) bridges by value to the
// record's `from` first, so an op keeps its exactness no matter which side
// of a whole-array write it fell on. The final hop to the live items — when
// the last record didn't land there — reconciles by value too.
const walkOps = (
  start: IdState,
  items: readonly unknown[],
  ops: readonly ArrayOpRecord[],
): IdState => {
  const walked = ops.reduce<IdState>((acc, op) => {
    const base = acc.items === op.from ? acc : reconcileIds(acc, op.from);
    return mappedIdState(base, op.mapping, op.to) ?? base;
  }, start);
  return walked.items === items ? walked : reconcileIds(walked, items);
};

// A row's DESCENDANT arrays have id entries of their own, keyed by path
// ("teams.0.members"), so when the outer array reorders, the entry at
// "teams.2.members" would otherwise meet team A's members with team C's
// history: value reconciliation finds nothing it knows, the same-index
// fallback hands the first rows the OTHER team's ids, the rest remint, and
// React remounts inputs a user may be typing in. Move the entries with their
// rows instead. The outer walk already decided which row went where (the
// id that was at index j is now at index i, or is gone), so the re-seat
// follows the ids, not the op: it is the same for an exact op mapping and
// for a whole-array write that reconciled by value. A vacated slot's
// entries are dropped so a later row at that index starts clean rather
// than inheriting a dead row's ids. Entries at an index the previous state
// never had (a hook mounted on a not-yet-existing slot) are left where
// they are. Only an outer hook runs this (it derives before its rows' inner
// hooks, parent before child); inner-only trees keep today's value
// fallback.
const reseatDescendants = (
  forStore: StoreIdEntries,
  path: string,
  prev: IdState,
  next: IdState,
): void => {
  if (prev.ids.length === 0) return;
  const newIndexById = new Map(next.ids.map((id, i) => [id, i] as const));
  // old index -> new index; undefined marks a removed row. Decided before
  // the entry map is scanned: a keystroke in any row re-derives the outer
  // ids (new array reference, same rows) and must not pay for the scan.
  const moves = prev.ids.map((id) => newIndexById.get(id));
  if (moves.every((to, from) => to === from)) return;
  const prefix = `${path}.`;
  const descendants = [...forStore.byPath.keys()].filter((key) =>
    key.startsWith(prefix),
  );
  const relocations = descendants.flatMap((key) => {
    const rest = key.slice(prefix.length);
    const dot = rest.indexOf(".");
    const segment = dot === -1 ? rest : rest.slice(0, dot);
    const from = Number(segment);
    if (!/^\d+$/.test(segment) || from >= prev.ids.length) return [];
    const entry = forStore.byPath.get(key);
    if (entry === undefined) return [];
    const to = moves[from];
    const target =
      to === undefined
        ? undefined
        : `${prefix}${to}${dot === -1 ? "" : rest.slice(dot)}`;
    return [{ key, target, entry }];
  });
  // Clear every moving source first, then seat the survivors: a swap's two
  // entries trade keys, so interleaving the two passes would overwrite one
  // of them before it was read.
  relocations.forEach(({ key }) => forStore.byPath.delete(key));
  relocations.forEach(({ target, entry }) => {
    if (target !== undefined) forStore.byPath.set(target, entry);
  });
};

const deriveIds = (
  store: object,
  path: string,
  items: readonly unknown[],
): IdState => {
  const forStore = storeIdEntries(store);
  const entry = sharedIdEntry(forStore, path);
  if (entry.state.items === items) return entry.state;
  const ops = arrayOpsFor(store, path);
  // The walk consumes every record, so the log is spent bookkeeping
  // afterwards — clear it, which also keeps ring composition from ever
  // merging a record a consumer is still anchored at. (The one residual:
  // a render discarded between clear and commit re-derives the final hop
  // by value — sound ids, possibly reminted where reuse was possible.)
  if (ops.length > 0) clearArrayOps(store, path);
  const next = walkOps(entry.state, items, ops);
  reseatDescendants(forStore, path, entry.state, next);
  entry.state = next;
  return next;
};

// The readable-error trap-guard, mirroring useField's: an explicit type
// argument (`useFieldArray<Item>(typedForm, "users")`) arity-matches ONLY
// the one-type-parameter overloads, and the structural one's brand then
// rejects the Form with a baffling "... not assignable to type
// 'undefined'". The error overload below intercepts that shape — TItem
// defaults to this unexported sentinel, which inferred calls can never
// escape (TItem has no inference site), collapsing `path` to `never`; an
// explicit TItem on a schema-carrying form instead types `path` as a
// string-literal instruction the compiler blames the path argument with.
declare const inferredCallsOnly: unique symbol;
interface InferredTypeArg {
  readonly [inferredCallsOnly]: typeof inferredCallsOnly;
}

// Overload order mirrors useField (and is just as deliberate): the
// typed-path overload sits last so a typo'd path on a Form<TSchema> is
// blamed on the path argument against the full FieldPath union, and the
// `schema?: undefined` brand forces a real Form past the widened structural
// overload — without it, `useFieldArray(form, "users")` would bind there
// and return UseFieldArrayReturn<unknown> instead of inferring the item
// type from the path. Schema-less FieldFormApi forms keep the explicit
// TItem parameter (there is nothing to infer from).
// The form is matched structurally (schema witness + typed store) instead
// of as Form<TSchema, D>: every Form is assignable regardless of its
// pathDepth, and keeping this overload at ONE type parameter preserves
// explicit instantiation expressions (`typeof useFieldArray<Schema,
// "tags">`) — TS applies explicit type args to every arity-compatible
// overload, so a second parameter here would check "tags" against it.
export function useFieldArray<TSchema extends z.ZodType>(
  form: FieldArrayFormApi &
    Readonly<{
      schema: TSchema;
      store: ReadonlyStore<FormState<z.input<TSchema>>>;
    }>,
  pathSelector: (state: FormState<z.input<TSchema>>) => string,
): UseFieldArrayReturn<unknown>;
// The trap-guard (see InferredTypeArg above): explicit type argument on a
// schema-carrying form → readable error on the path argument; inferred
// calls fall through (path collapses to never).
export function useFieldArray<TItem = InferredTypeArg>(
  form: FieldArrayFormApi & Readonly<{ schema: z.ZodType }>,
  path: TItem extends InferredTypeArg
    ? never
    : "Remove the explicit type argument: a schema-typed form infers the item type from the path",
): UseFieldArrayReturn<TItem>;
export function useFieldArray<TItem = unknown>(
  form: FieldArrayFormApi & { readonly schema?: undefined },
  path: FieldPathArg<unknown>,
): UseFieldArrayReturn<TItem>;
// D last with a default (P's constraint forward-references it), preserving
// the arity of explicit instantiations like
// `useFieldArray<typeof schema, "tags">`. P is an ARRAY path (the core's
// ArrayFieldPath: variable-length arrays only, optional/nullable included):
// a scalar path used to bind here with a never-typed item (every write an
// error, the hook itself not), and a tuple path bound with the tuple's
// element union while the core refused the same push. The item type comes
// from the core's ArrayItemOf, so the hook and form.arrayPush agree.
// The `& string` is load-bearing: P's constraint depends on D, which is
// inferred from the SAME call, so while P is being inferred the constraint
// is a deferred conditional type and TS cannot see that it is made of
// string literals. Without a visible primitive constraint the "users"
// candidate widens to `string`, fails the constraint, and P falls back to
// the whole array-path union (every item type at once). Intersecting with
// string keeps the literal, exactly as FieldPath's own shape happened to.
export function useFieldArray<
  TSchema extends z.ZodType,
  P extends ArrayFieldPath<z.input<TSchema>, D> & string,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  path: P,
): UseFieldArrayReturn<ArrayItemOf<FieldValue<z.input<TSchema>, P>>>;
export function useFieldArray<TItem = unknown>(
  form: FieldArrayFormApi,
  pathArg: FieldPathArg<unknown>,
): UseFieldArrayReturn<TItem> {
  const path = useStore(form.store, (state) =>
    typeof pathArg === "function" ? pathArg(state) : pathArg,
  );
  const slice = useStore(
    form.store,
    useShallow((state) => {
      const value = getAtPath(state.values, path);
      return {
        items: (Array.isArray(value) ? value : EMPTY_ITEMS) as readonly TItem[],
        // Own-key read, like useField: an array named "constructor" must
        // not read Object as its error list.
        error: entryAt(state.errors, path),
        touched: flagAt(state.touched, path),
        dirty: isFieldDirty(value, getAtPath(state.initialValues, path)),
        isValidating: flagAt(state.isValidating, path),
      };
    }),
  );
  const items = slice.items;
  const error = slice.error;

  // Ids derive from the shared per-(store, path) entry: the core's op log
  // replays each array op's exact index mapping (hook-issued or imperative
  // — both go through applyArrayOp, which records them), and value
  // reconciliation covers everything else (setValue of a whole array,
  // restore, resets). Deriving during render is safe because the entry is
  // a convergent cache — every commit is a pure function of a real store
  // state — and cheap because it early-exits on the same items reference.
  // All hook instances on the same path read the same entry, so their ids
  // can never disagree.
  const ids = deriveIds(form.store, path, items).ids;

  // After every op, revalidate the ARRAY path under the exact change-trigger
  // gate useField.setValue applies (same shouldValidateOn call), so a visible
  // array-level error (z.array().min()) tracks push/remove instead of going
  // stale. The result is deliberately unhandled — the core self-routes async
  // schemas (validateField returns { kind: "pending" } having already started
  // the async pass). validateField is probed: a hand-rolled FieldArrayFormApi
  // without it skips revalidation instead of crashing. The IMPERATIVE
  // form.arrayPush/arrayRemove stay non-revalidating on purpose — the same
  // layering as form.setValue (raw write) vs useField.setValue (write + gate).
  const revalidate = useCallback(() => {
    const state = form.store.getState();
    if (
      shouldValidateOn(
        "change",
        state.mode,
        state.reValidateMode,
        state.submitCount > 0,
        flagAt(state.touched, path),
      )
    ) {
      form.validateField?.(path);
    }
  }, [form, path]);

  const push = useCallback(
    (item: TItem) => {
      form.arrayPush(path, item);
      revalidate();
    },
    [form, path, revalidate],
  );

  const remove = useCallback(
    (index: number) => {
      form.arrayRemove(path, index);
      revalidate();
    },
    [form, path, revalidate],
  );

  const insert = useCallback(
    (index: number, item: TItem) => {
      form.arrayInsert(path, index, item);
      revalidate();
    },
    [form, path, revalidate],
  );

  const move = useCallback(
    (from: number, to: number) => {
      form.arrayMove(path, from, to);
      revalidate();
    },
    [form, path, revalidate],
  );

  const swap = useCallback(
    (a: number, b: number) => {
      form.arraySwap(path, a, b);
      revalidate();
    },
    [form, path, revalidate],
  );

  const fields = useMemo<readonly FieldArrayEntry<TItem>[]>(
    () =>
      items.map((value, index) => ({
        id: ids[index] ?? `__zfa_fallback_${index}`,
        value,
      })),
    [items, ids],
  );

  const setError = useCallback(
    // Same string-shorthand normalization as useField.setError, so custom
    // implementations typed for readonly string[] never receive a bare
    // string.
    (errors: string | readonly string[]) =>
      form.setError?.(path, typeof errors === "string" ? [errors] : errors),
    [form, path],
  );

  const clearError = useCallback(() => form.clearErrors?.(path), [form, path]);

  const setTouched = useCallback(
    (touched?: boolean) => form.setTouched?.(path, touched),
    [form, path],
  );

  // useField.onBlur without the debounce: array-level rules are cheap
  // (length, uniqueness) and the hook takes no debounceMs option.
  const onBlur = useCallback(() => {
    form.setTouched?.(path, true);
    const state = form.store.getState();
    if (
      shouldValidateOn(
        "blur",
        state.mode,
        state.reValidateMode,
        state.submitCount > 0,
        true,
      )
    ) {
      form.validateField?.(path);
    }
  }, [form, path]);

  const validate = useCallback(
    (): FieldValidationResult =>
      form.validateField?.(path) ?? { kind: "valid" },
    [form, path],
  );

  const replace = useCallback(
    (next: readonly TItem[]) => {
      form.setValue?.(path, next);
      revalidate();
    },
    [form, path, revalidate],
  );

  const update = useCallback(
    (index: number, item: TItem) => {
      form.setValue?.(`${path}.${index}`, item);
      revalidate();
    },
    [form, path, revalidate],
  );

  const prepend = useCallback(
    (item: TItem) => {
      form.arrayInsert(path, 0, item);
      revalidate();
    },
    [form, path, revalidate],
  );

  const clear = useCallback(() => {
    form.setValue?.(path, []);
    revalidate();
  }, [form, path, revalidate]);

  return useMemo(
    () => ({
      path,
      fields,
      items,
      length: items.length,
      error,
      firstError: error?.[0],
      setError,
      clearError,
      touched: slice.touched,
      dirty: slice.dirty,
      isValidating: slice.isValidating,
      setTouched,
      onBlur,
      validate,
      push,
      remove,
      insert,
      move,
      swap,
      replace,
      update,
      prepend,
      clear,
    }),
    [
      path,
      fields,
      items,
      error,
      setError,
      clearError,
      slice.touched,
      slice.dirty,
      slice.isValidating,
      setTouched,
      onBlur,
      validate,
      push,
      remove,
      insert,
      move,
      swap,
      replace,
      update,
      prepend,
      clear,
    ],
  );
}
