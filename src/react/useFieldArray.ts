import { useCallback, useMemo, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import { getAtPath } from "../core/path";
import type { FormState } from "../core/types";

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
// rows — not just length-preserving appends/truncations. A positional
// fallback hands a vanished item's id to a still-unmatched one, so editing a
// field (which produces a fresh item reference) keeps its row instead of
// remounting it.
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

  // Whatever prev ids remain belong to items that vanished; feed them to the
  // still-unmatched items in order, in-place edits before fresh mints.
  const leftover = [...buckets.values()]
    .flat()
    .sort((a, b) => a - b)
    .map((i) => prev.ids[i])
    .filter((id): id is string => id !== undefined);

  // Running 1-based count of unmatched slots up to each position, so every
  // unmatched item maps straight to its leftover id (or a freshly minted one)
  // without rebuilding the ids array per element.
  const ordinals = matchedIds.reduce<number[]>((acc, id) => {
    const count = acc.length === 0 ? 0 : (acc[acc.length - 1] ?? 0);
    acc.push(id === null ? count + 1 : count);
    return acc;
  }, []);
  const unmatched =
    ordinals.length === 0 ? 0 : (ordinals[ordinals.length - 1] ?? 0);
  const ids = matchedIds.map((id, i) => {
    if (id !== null) return id;
    const ordinal = ordinals[i] ?? 0;
    return (
      leftover[ordinal - 1] ??
      `__zfa_${prev.counter + (ordinal - leftover.length)}`
    );
  });

  return {
    items: nextItems,
    ids,
    counter: prev.counter + Math.max(0, unmatched - leftover.length),
  };
};

export const useFieldArray = <TItem = unknown>(
  form: FieldArrayFormApi,
  pathArg: string | ((state: FormState<unknown>) => string),
): UseFieldArrayReturn<TItem> => {
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
};
