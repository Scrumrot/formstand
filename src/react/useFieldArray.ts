import { useCallback, useMemo, useState } from "react";
import type { z } from "zod";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
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
}>;

const EMPTY_ID_STATE: IdState = { items: [], ids: [], counter: 0 };

// Stable reference for "path holds no array yet" — a fresh [] per selector
// run would defeat useShallow and re-render on every store change.
const EMPTY_ITEMS: readonly never[] = [];

// Derive a stable id per item by reconciling the live items against the
// previous render's items. Ids follow items by identity/value, so reorders,
// resets, and mutations that bypass this hook all keep keys glued to their
// rows — not just length-preserving appends/truncations. A same-index
// fallback keeps an edited row's id (editing produces a fresh item
// reference at the same position) without remounting it. This is the
// FALLBACK path: ops issued through the hook commit their exact id
// transform directly (see applyOpIds below), because value matching cannot
// tell Object.is-equal rows apart.
const reconcileIds = (prev: IdState, nextItems: readonly unknown[]): IdState => {
  if (prev.items === nextItems) return prev;
  if (
    prev.items.length === nextItems.length &&
    prev.items.every((item, i) => Object.is(item, nextItems[i]))
  ) {
    return prev;
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

  // Running 1-based mint count up to each position, so fresh ids number
  // consecutively without rebuilding the ids array per element.
  const mintCounts = reused.reduce<readonly number[]>((acc, id) => {
    const count = acc[acc.length - 1] ?? 0;
    return [...acc, id === null ? count + 1 : count];
  }, []);
  const minted = mintCounts[mintCounts.length - 1] ?? 0;
  const ids = reused.map(
    (id, i) => id ?? `__zfa_${prev.counter + (mintCounts[i] ?? 0)}`,
  );

  return { items: nextItems, ids, counter: prev.counter + minted };
};

// Identity-index array [0, 1, ..., len-1]: the base the per-op mappings
// transform with the same slice logic as the core's array ops.
const opIndices = (len: number): readonly number[] =>
  Array.from({ length: len }, (_, i) => i);

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
  // Mint numbering mirrors reconcileIds (counter + running 1-based count),
  // so op-minted and reconcile-minted ids can never collide.
  const mintCounts = mapping.reduce<readonly number[]>((acc, src) => {
    const count = acc[acc.length - 1] ?? 0;
    return [...acc, src === -1 ? count + 1 : count];
  }, []);
  const minted = mintCounts[mintCounts.length - 1] ?? 0;
  const ids = mapping.map((src, i) =>
    src === -1
      ? `__zfa_${prev.counter + (mintCounts[i] ?? 0)}`
      : (prev.ids[src] as string),
  );
  return { items: liveItems, ids, counter: prev.counter + minted };
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

  // Reconcile ids against the live items every render, using the
  // derived-state-from-props pattern (a render-phase setState, which React
  // supports and immediately re-renders with) instead of mutating a ref during
  // render — a discarded concurrent render must not advance id bookkeeping,
  // and skipping the commit when ids look unchanged is unsound (a reorder
  // after uncommitted in-place edits would then match against a stale items
  // snapshot and glue ids to the wrong rows). The re-render is cheap: its
  // reconcile early-exits on the same items reference. When the form or path
  // changes, drop the previous array's ids but carry the counter forward so
  // freshly minted ids never collide with old ones.
  const [idEntry, setIdEntry] = useState<
    Readonly<{ form: FieldArrayFormApi; path: string; state: IdState }>
  >({ form, path, state: EMPTY_ID_STATE });
  const base =
    idEntry.form === form && idEntry.path === path
      ? idEntry.state
      : { ...EMPTY_ID_STATE, counter: idEntry.state.counter };
  const nextIdState = reconcileIds(base, items);
  if (
    idEntry.form !== form ||
    idEntry.path !== path ||
    idEntry.state !== nextIdState
  ) {
    setIdEntry({ form, path, state: nextIdState });
  }
  const ids = nextIdState.ids;

  // Ops issued through the hook know EXACTLY how indices moved, so commit
  // that transform to the id list right after the store write instead of
  // re-deriving it from values: value matching cannot tell Object.is-equal
  // rows apart — remove(0) on ["", ""] would hand the survivor the removed
  // row's id and React would keep the wrong subtree (focus/local state).
  // mappedIdState verifies the mapping against the live items and returns
  // null when the store did something else (refused op, interleaved write),
  // leaving the render-phase reconcile to handle it as before.
  const applyOpIds = useCallback(
    (mapping: (len: number) => readonly number[]) => {
      const value = getAtPath(form.store.getState().values, path);
      const liveItems: readonly unknown[] = Array.isArray(value)
        ? value
        : EMPTY_ITEMS;
      setIdEntry((entry) => {
        if (entry.form !== form || entry.path !== path) return entry;
        // Same reference: the op was refused (bounds warn) or was a no-op.
        if (entry.state.items === liveItems) return entry;
        const next = mappedIdState(
          entry.state,
          mapping(entry.state.items.length),
          liveItems,
        );
        return next === null ? entry : { form, path, state: next };
      });
    },
    [form, path],
  );

  const push = useCallback(
    (item: TItem) => {
      form.arrayPush(path, item);
      applyOpIds((len) => [...opIndices(len), -1]);
    },
    [form, path, applyOpIds],
  );

  const remove = useCallback(
    (index: number) => {
      form.arrayRemove(path, index);
      applyOpIds((len) => {
        const idx = opIndices(len);
        return [...idx.slice(0, index), ...idx.slice(index + 1)];
      });
    },
    [form, path, applyOpIds],
  );

  const insert = useCallback(
    (index: number, item: TItem) => {
      form.arrayInsert(path, index, item);
      applyOpIds((len) => {
        const idx = opIndices(len);
        return [...idx.slice(0, index), -1, ...idx.slice(index)];
      });
    },
    [form, path, applyOpIds],
  );

  const move = useCallback(
    (from: number, to: number) => {
      form.arrayMove(path, from, to);
      applyOpIds((len) => {
        const idx = opIndices(len);
        const without = [...idx.slice(0, from), ...idx.slice(from + 1)];
        return [...without.slice(0, to), from, ...without.slice(to)];
      });
    },
    [form, path, applyOpIds],
  );

  const swap = useCallback(
    (a: number, b: number) => {
      form.arraySwap(path, a, b);
      applyOpIds((len) =>
        opIndices(len).map((i) => (i === a ? b : i === b ? a : i)),
      );
    },
    [form, path, applyOpIds],
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
