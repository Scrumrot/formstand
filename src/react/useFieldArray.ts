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
import type { FieldPath, FieldValue } from "../core/fieldPath";
import { getAtPath } from "../core/path";
import type { FormState } from "../core/types";
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
}>;

export type FieldArrayEntry<TItem> = Readonly<{
  id: string;
  value: TItem;
}>;

export type UseFieldArrayReturn<TItem> = Readonly<{
  fields: readonly FieldArrayEntry<TItem>[];
  items: readonly TItem[];
  length: number;
  error: readonly string[] | undefined;
  push: (item: TItem) => void;
  remove: (index: number) => void;
  insert: (index: number, item: TItem) => void;
  move: (from: number, to: number) => void;
  swap: (a: number, b: number) => void;
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

  // Bucket prev positions by item so duplicate primitives match in order.
  const buckets = prev.items.reduce<Map<unknown, number[]>>((acc, item, i) => {
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
  const matchedIds: readonly (string | null)[] = nextItems.map((item) => {
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

const sharedIdEntry = (store: object, path: string): SharedIdEntry => {
  const existingStore = sharedIdEntries.get(store);
  const forStore = existingStore ?? { byPath: new Map(), seq: 1 };
  if (existingStore === undefined) sharedIdEntries.set(store, forStore);
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

const deriveIds = (
  store: object,
  path: string,
  items: readonly unknown[],
): IdState => {
  const entry = sharedIdEntry(store, path);
  if (entry.state.items === items) return entry.state;
  const ops = arrayOpsFor(store, path);
  // The walk consumes every record, so the log is spent bookkeeping
  // afterwards — clear it, which also keeps ring composition from ever
  // merging a record a consumer is still anchored at. (The one residual:
  // a render discarded between clear and commit re-derives the final hop
  // by value — sound ids, possibly reminted where reuse was possible.)
  if (ops.length > 0) clearArrayOps(store, path);
  const next = walkOps(entry.state, items, ops);
  entry.state = next;
  return next;
};

// The element type at an array-valued path. FieldValue re-adds `| undefined`
// for arrays reached through optional ancestors, so strip that before
// extracting; a non-array path yields `never`, which makes every write
// (`push(never)`) an immediate error instead of a silently-`unknown` bind.
export type ArrayItemOf<T> = [NonNullable<T>] extends [readonly (infer U)[]]
  ? U
  : never;

// Overload order mirrors useField (and is just as deliberate): the
// typed-path overload sits last so a typo'd path on a Form<TSchema> is
// blamed on the path argument against the full FieldPath union, and the
// `schema?: undefined` brand forces a real Form past the widened structural
// overload — without it, `useFieldArray(form, "users")` would bind there
// and return UseFieldArrayReturn<unknown> instead of inferring the item
// type from the path. Schema-less FieldFormApi forms keep the explicit
// TItem parameter (there is nothing to infer from).
export function useFieldArray<TSchema extends z.ZodType>(
  form: Form<TSchema>,
  pathSelector: (state: FormState<z.input<TSchema>>) => string,
): UseFieldArrayReturn<unknown>;
export function useFieldArray<TItem = unknown>(
  form: FieldArrayFormApi & { readonly schema?: undefined },
  path: FieldPathArg<unknown>,
): UseFieldArrayReturn<TItem>;
export function useFieldArray<
  TSchema extends z.ZodType,
  P extends FieldPath<z.input<TSchema>>,
>(
  form: Form<TSchema>,
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
        error: state.errors[path],
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

  const push = useCallback(
    (item: TItem) => form.arrayPush(path, item),
    [form, path],
  );

  const remove = useCallback(
    (index: number) => form.arrayRemove(path, index),
    [form, path],
  );

  const insert = useCallback(
    (index: number, item: TItem) => form.arrayInsert(path, index, item),
    [form, path],
  );

  const move = useCallback(
    (from: number, to: number) => form.arrayMove(path, from, to),
    [form, path],
  );

  const swap = useCallback(
    (a: number, b: number) => form.arraySwap(path, a, b),
    [form, path],
  );

  const fields = useMemo<readonly FieldArrayEntry<TItem>[]>(
    () =>
      items.map((value, index) => ({
        id: ids[index] ?? `__zfa_fallback_${index}`,
        value,
      })),
    [items, ids],
  );

  return useMemo(
    () => ({
      fields,
      items,
      length: items.length,
      error,
      push,
      remove,
      insert,
      move,
      swap,
    }),
    [fields, items, error, push, remove, insert, move, swap],
  );
}
