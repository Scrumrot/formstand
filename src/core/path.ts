export type PathSegment = string | number;

// Segment keys containing "." are not addressable (paths are split on dots);
// use nested objects or index-free keys instead.

// Writes above this index are refused — a typo'd path like "items.4294967296"
// must not allocate a multi-gigabyte array.
const MAX_ARRAY_INDEX = 100_000;

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

// The existing container decides how a segment is interpreted: arrays take
// numeric segments as indices, records take any segment as a string key (so a
// z.record keyed "0" reads/writes the record key, not an array index). Only
// when the container is absent does the segment type pick what gets created.
const readSegment = (obj: unknown, segment: PathSegment): unknown => {
  if (obj == null) return undefined;
  if (Array.isArray(obj)) {
    return typeof segment === "number" ? obj[segment] : undefined;
  }
  return isPlainRecord(obj) ? obj[String(segment)] : undefined;
};

export const getAtPath = (obj: unknown, path: string): unknown =>
  parsePath(path).reduce<unknown>(readSegment, obj);

// True when every array traversed by `path` is long enough for its index.
// Object properties may be legitimately absent (an empty optional field is
// still a real, addressable field), but an out-of-range array index addresses
// no slot at all — a full-form parse would never key an error there.
export const arrayIndicesInBounds = (obj: unknown, path: string): boolean =>
  parsePath(path).reduce<Readonly<{ ok: boolean; current: unknown }>>(
    (acc, segment) =>
      !acc.ok ||
      (Array.isArray(acc.current) &&
        typeof segment === "number" &&
        segment >= acc.current.length)
        ? { ok: false, current: undefined }
        : { ok: true, current: readSegment(acc.current, segment) },
    { ok: true, current: obj },
  ).ok;

const writeIntoArray = (
  arr: readonly unknown[],
  index: number,
  rest: readonly PathSegment[],
  value: unknown,
): readonly unknown[] => {
  const length = Math.max(arr.length, index + 1);
  return Array.from({ length }, (_, i) =>
    i === index ? writeSegments(arr[i], rest, value) : arr[i],
  );
};

const refusesHugeIndex = (index: number): boolean => {
  if (index > MAX_ARRAY_INDEX) {
    console.warn(
      `[zustand-forms] refusing to write array index ${index} (max ${MAX_ARRAY_INDEX}); value left unchanged.`,
    );
    return true;
  }
  return false;
};

const writeSegments = (
  obj: unknown,
  segments: readonly PathSegment[],
  value: unknown,
): unknown => {
  const [head, ...rest] = segments;
  if (head === undefined) return value;

  if (Array.isArray(obj)) {
    if (typeof head !== "number") {
      console.warn(
        `[zustand-forms] cannot write string key "${head}" into an array; value left unchanged.`,
      );
      return obj;
    }
    if (refusesHugeIndex(head)) return obj;
    return writeIntoArray(obj, head, rest, value);
  }

  // Records take any segment as a string key (mirroring readSegment), so a
  // z.record keyed by a large numeric id is writable — the array-index cap
  // only applies where an array actually exists or would be created.
  if (isPlainRecord(obj)) {
    const key = String(head);
    return { ...obj, [key]: writeSegments(obj[key], rest, value) };
  }

  // Absent (or non-container) value: create a container from the segment type.
  if (typeof head === "number") {
    if (refusesHugeIndex(head)) return obj;
    return writeIntoArray([], head, rest, value);
  }
  return { [head]: writeSegments(undefined, rest, value) };
};

export const setAtPath = <T>(obj: T, path: string, value: unknown): T =>
  writeSegments(obj, parsePath(path), value) as T;
