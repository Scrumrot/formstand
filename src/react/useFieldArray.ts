import { useCallback, useMemo } from "react";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
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

export type UseFieldArrayReturn<TItem> = Readonly<{
  items: readonly TItem[];
  length: number;
  push: (item: TItem) => void;
  remove: (index: number) => void;
  insert: (index: number, item: TItem) => void;
  move: (from: number, to: number) => void;
  swap: (a: number, b: number) => void;
}>;

export const useFieldArray = <TItem = unknown>(
  form: FieldArrayFormApi,
  path: string,
): UseFieldArrayReturn<TItem> => {
  const items = useStore(form.store, (state) => {
    const value = getAtPath(state.values, path);
    return (Array.isArray(value) ? value : []) as readonly TItem[];
  });

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

  return useMemo(
    () => ({ items, length: items.length, push, remove, insert, move, swap }),
    [items, push, remove, insert, move, swap],
  );
};
