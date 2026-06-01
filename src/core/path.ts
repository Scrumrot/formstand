export type PathSegment = string | number;

const isIndexSegment = (s: string): boolean => {
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && String(n) === s;
};

export const parsePath = (path: string): readonly PathSegment[] =>
  path === ""
    ? []
    : path.split(".").map((s) => (isIndexSegment(s) ? Number(s) : s));

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readSegment = (obj: unknown, segment: PathSegment): unknown => {
  if (obj == null) return undefined;
  if (typeof segment === "number") {
    return Array.isArray(obj) ? obj[segment] : undefined;
  }
  return isPlainRecord(obj) ? obj[segment] : undefined;
};

export const getAtPath = (obj: unknown, path: string): unknown =>
  parsePath(path).reduce<unknown>(readSegment, obj);

const writeSegments = (
  obj: unknown,
  segments: readonly PathSegment[],
  value: unknown,
): unknown => {
  const [head, ...rest] = segments;
  if (head === undefined) return value;

  if (typeof head === "number") {
    const arr = Array.isArray(obj) ? obj : [];
    const length = Math.max(arr.length, head + 1);
    return Array.from({ length }, (_, i) =>
      i === head ? writeSegments(arr[i], rest, value) : arr[i],
    );
  }

  const record = isPlainRecord(obj) ? obj : {};
  return { ...record, [head]: writeSegments(record[head], rest, value) };
};

export const setAtPath = <T>(obj: T, path: string, value: unknown): T =>
  writeSegments(obj, parsePath(path), value) as T;
