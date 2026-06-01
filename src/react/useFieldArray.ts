import { useCallback, useMemo, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import { getAtPath } from "../core/path";
import type { FormState } from "../core/types";

type ReadonlyStore<T> = Pick<
  StoreApi<T>,
  "getState" | "getInitialState" | "subscribe"
>;

export type FieldArrayFormApi = Readonly<{
  store: ReadonlyStore<FormState<unknown>>;
  arrayPush: (path: string, item: unknown) => void;
  arrayRemove: (path: string, index: number) => void;
  arrayInsert: (path: string, index: number, item: unknown) => void;
  arrayMove: (path: string, from: number, to: number) => void;
  arraySwap: (path: string, a: number, b: number) => void;
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

type IdState = Readonly<{ ids: readonly string[]; counter: number }>;

const advance = (state: IdState): Readonly<{ next: IdState; id: string }> => {
  const counter = state.counter + 1;
  return {
    next: { ids: state.ids, counter },
    id: `__zfa_${counter}`,
  };
};

const padIds = (state: IdState, target: number): IdState => {
  if (target <= state.ids.length) return state;
  const additions = Array.from({ length: target - state.ids.length });
  return additions.reduce<IdState>((acc) => {
    const stepped = advance(acc);
    return { ids: [...stepped.next.ids, stepped.id], counter: stepped.next.counter };
  }, state);
};

const trimIds = (state: IdState, target: number): IdState =>
  target >= state.ids.length
    ? state
    : { ids: state.ids.slice(0, target), counter: state.counter };

const insertId = (state: IdState, index: number): IdState => {
  const stepped = advance(state);
  return {
    ids: [
      ...stepped.next.ids.slice(0, index),
      stepped.id,
      ...stepped.next.ids.slice(index),
    ],
    counter: stepped.next.counter,
  };
};

const removeId = (state: IdState, index: number): IdState => ({
  ids: [...state.ids.slice(0, index), ...state.ids.slice(index + 1)],
  counter: state.counter,
});

const moveId = (state: IdState, from: number, to: number): IdState => {
  const moved = state.ids[from];
  const without = [...state.ids.slice(0, from), ...state.ids.slice(from + 1)];
  return {
    ids: [
      ...without.slice(0, to),
      ...(moved === undefined ? [] : [moved]),
      ...without.slice(to),
    ],
    counter: state.counter,
  };
};

const swapId = (state: IdState, a: number, b: number): IdState => ({
  ids: state.ids.map((v, i) =>
    i === a ? (state.ids[b] ?? v) : i === b ? (state.ids[a] ?? v) : v,
  ),
  counter: state.counter,
});

export const useFieldArray = <TItem = unknown>(
  form: FieldArrayFormApi,
  path: string,
): UseFieldArrayReturn<TItem> => {
  const items = useStore(form.store, (state) => {
    const value = getAtPath(state.values, path);
    return (Array.isArray(value) ? value : []) as readonly TItem[];
  });
  const error = useStore(
    form.store,
    useShallow((state) => state.errors[path]),
  );

  const idStateRef = useRef<IdState | null>(null);
  if (idStateRef.current === null) {
    idStateRef.current = padIds({ ids: [], counter: 0 }, items.length);
  }

  if (items.length > idStateRef.current.ids.length) {
    idStateRef.current = padIds(idStateRef.current, items.length);
  } else if (items.length < idStateRef.current.ids.length) {
    idStateRef.current = trimIds(idStateRef.current, items.length);
  }

  const ids = idStateRef.current.ids;

  const push = useCallback(
    (item: TItem) => {
      idStateRef.current = padIds(
        idStateRef.current ?? { ids: [], counter: 0 },
        (idStateRef.current?.ids.length ?? 0) + 1,
      );
      form.arrayPush(path, item);
    },
    [form, path],
  );

  const remove = useCallback(
    (index: number) => {
      const current = idStateRef.current ?? { ids: [], counter: 0 };
      idStateRef.current = removeId(current, index);
      form.arrayRemove(path, index);
    },
    [form, path],
  );

  const insert = useCallback(
    (index: number, item: TItem) => {
      const current = idStateRef.current ?? { ids: [], counter: 0 };
      idStateRef.current = insertId(current, index);
      form.arrayInsert(path, index, item);
    },
    [form, path],
  );

  const move = useCallback(
    (from: number, to: number) => {
      const current = idStateRef.current ?? { ids: [], counter: 0 };
      idStateRef.current = moveId(current, from, to);
      form.arrayMove(path, from, to);
    },
    [form, path],
  );

  const swap = useCallback(
    (a: number, b: number) => {
      const current = idStateRef.current ?? { ids: [], counter: 0 };
      idStateRef.current = swapId(current, a, b);
      form.arraySwap(path, a, b);
    },
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
