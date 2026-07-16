export type IndexMapper = (oldIndex: number) => number | null;

export const removeAt =
  (i: number): IndexMapper =>
  (n) =>
    n === i ? null : n > i ? n - 1 : n;

export const insertAt =
  (i: number): IndexMapper =>
  (n) =>
    n >= i ? n + 1 : n;

export const moveFromTo =
  (from: number, to: number): IndexMapper =>
  (n) => {
    if (n === from) return to;
    if (from < to && n > from && n <= to) return n - 1;
    if (from > to && n >= to && n < from) return n + 1;
    return n;
  };

export const swapIndices =
  (a: number, b: number): IndexMapper =>
  (n) =>
    n === a ? b : n === b ? a : n;

// New-index → old-index mappings (the inverse view of the IndexMapper
// factories above), materialized as arrays because their consumer — the row
// id lists that follow array rows — walks positions. -1 marks a freshly
// created row (it has no old index and mints a new id).
const indices = (len: number): readonly number[] =>
  Array.from({ length: len }, (_, i) => i);

export type IdMapping = (length: number) => readonly number[];

export const idMapPush: IdMapping = (len) => [...indices(len), -1];

export const idMapRemove =
  (index: number): IdMapping =>
  (len) => {
    const idx = indices(len);
    return [...idx.slice(0, index), ...idx.slice(index + 1)];
  };

export const idMapInsert =
  (index: number): IdMapping =>
  (len) => {
    const idx = indices(len);
    return [...idx.slice(0, index), -1, ...idx.slice(index)];
  };

export const idMapMove =
  (from: number, to: number): IdMapping =>
  (len) => {
    const idx = indices(len);
    const without = [...idx.slice(0, from), ...idx.slice(from + 1)];
    return [...without.slice(0, to), from, ...without.slice(to)];
  };

export const idMapSwap =
  (a: number, b: number): IdMapping =>
  (len) =>
    indices(len).map((i) => (i === a ? b : i === b ? a : i));

const indexAndTail = (
  rest: string,
): Readonly<{ index: number; tail: string }> | null => {
  const dotIdx = rest.indexOf(".");
  const idxStr = dotIdx === -1 ? rest : rest.slice(0, dotIdx);
  const tail = dotIdx === -1 ? "" : rest.slice(dotIdx);
  const idx = Number(idxStr);
  if (!Number.isInteger(idx) || idx < 0 || String(idx) !== idxStr) return null;
  return { index: idx, tail };
};

export const reKeyByArrayPath = <V>(
  map: Readonly<Record<string, V>>,
  basePath: string,
  mapper: IndexMapper,
): Readonly<Record<string, V>> => {
  const prefix = basePath === "" ? "" : `${basePath}.`;
  return Object.fromEntries(
    Object.entries(map).flatMap(([key, value]) => {
      if (key === basePath) return [[key, value]];
      if (!key.startsWith(prefix)) return [[key, value]];
      const parsed = indexAndTail(key.slice(prefix.length));
      if (parsed === null) return [[key, value]];
      const next = mapper(parsed.index);
      if (next === null) return [];
      return [[`${prefix}${next}${parsed.tail}`, value]];
    }),
  );
};
