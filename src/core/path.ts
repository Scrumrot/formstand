import { isPlainObject } from "./equality";

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

// Hot path: every field subscription re-resolves its path on every store
// notification (getAtPath in selectors), so parsing is memoized — a form's
// paths are a small fixed set. Bounded like equality's dirtyCache: a
// pathological unbounded key set resets the cache instead of growing it
// forever (the reset only costs re-parsing, never correctness).
const PARSE_CACHE_MAX = 4096;
const parseCache = new Map<string, readonly PathSegment[]>();

export const parsePath = (path: string): readonly PathSegment[] => {
  const cached = parseCache.get(path);
  if (cached !== undefined) return cached;
  // Frozen because the array is now SHARED across every caller (and cached):
  // parsePath is a public export, and pre-cache each call returned a private
  // array that was safe to mutate. Freezing enforces the `readonly` type at
  // runtime so an external `.sort()`/`.reverse()`/`.push()` throws instead of
  // silently corrupting the cache for every later lookup of this path.
  const segments = Object.freeze(
    path === ""
      ? []
      : path.split(".").map((s) => (isIndexSegment(s) ? Number(s) : s)),
  );
  if (parseCache.size >= PARSE_CACHE_MAX) parseCache.clear();
  parseCache.set(path, segments);
  return segments;
};

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
  // Own properties only: a runtime-built path like "lookup.constructor" on a
  // z.record must read as absent, not leak Object.prototype members as field
  // values.
  return isPlainRecord(obj) && Object.hasOwn(obj, String(segment))
    ? obj[String(segment)]
    : undefined;
};

export const getAtPath = (obj: unknown, path: string): unknown =>
  parsePath(path).reduce<unknown>(readSegment, obj);

export type SlotAtPath =
  | Readonly<{ exists: true; value: unknown }>
  | Readonly<{ exists: false }>;

// Resolve `path` while checking that every segment is read from a real
// container: an in-range array index, or a key on a plain record (containers
// decide, mirroring readSegment). A segment into an absent or non-container
// value addresses no slot at all — a full-form parse would key that error at
// the missing ANCESTOR, not here, so field-scoped validation must skip it
// rather than parse the leaf's subschema against undefined (which would
// fabricate a spurious "required" error the full pass never produces). Note
// this checks the CONTAINER, not the value: a leaf that is undefined at the
// FINAL step through a real record is still an addressable (legitimately
// empty) slot. Returns the resolved value so callers don't walk twice.
export const slotAtPath = (obj: unknown, path: string): SlotAtPath => {
  const walked = parsePath(path).reduce<
    Readonly<{ ok: boolean; current: unknown }>
  >(
    (acc, segment) => {
      const container = acc.current;
      const addressable =
        typeof segment === "number"
          ? Array.isArray(container)
            ? segment < container.length
            : isPlainRecord(container)
          : isPlainRecord(container);
      return !acc.ok || !addressable
        ? { ok: false, current: undefined }
        : { ok: true, current: readSegment(container, segment) };
    },
    { ok: true, current: obj },
  );
  return walked.ok ? { exists: true, value: walked.current } : { exists: false };
};

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
      `[formstand] refusing to write array index ${index} (max ${MAX_ARRAY_INDEX}); value left unchanged.`,
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
        `[formstand] cannot write string key "${head}" into an array; value left unchanged.`,
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
    // Spreading is only safe for PLAIN objects: spreading a Date/Map/Set or
    // class instance keeps own enumerable props but drops the prototype (and
    // for Map/Set, every entry) — the original would be silently destroyed.
    // Refuse, like the other unwritable shapes above.
    if (!isPlainObject(obj)) {
      console.warn(
        `[formstand] cannot write key "${String(head)}" through a non-plain object (Date/Map/Set/class instance); value left unchanged.`,
      );
      return obj;
    }
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
