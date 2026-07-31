// Walking a values object into the list of paths the panel shows.

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  // A Date is a leaf, not a container to recurse into: its own keys are
  // methods, and useField binds the Date itself.
  !(value instanceof Date);

// The addressable leaf paths of a values object, in declaration order.
// Arrays contribute one path per ROW rather than one for the array, because
// that is what a field binds to; the array's own path still shows up in the
// panel via the error map, which is where `z.array().min(1)` lands.
//
// An empty object or array is itself a leaf here. It has no children to
// describe, and dropping it would hide a field that exists in the schema.
export const leafPaths = (value: unknown, base = ""): readonly string[] => {
  const join = (key: string | number): string =>
    base === "" ? String(key) : `${base}.${String(key)}`;

  if (Array.isArray(value)) {
    return value.length === 0
      ? [base]
      : value.flatMap((item, index) => leafPaths(item, join(index)));
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    return keys.length === 0
      ? [base]
      : keys.flatMap((key) => leafPaths(value[key], join(key)));
  }
  return [base];
};

// Error keys that no leaf path covers: the root "" key (a schema-wide
// refine), array-level messages keyed at the container, and server verdicts
// written at a path that holds no value yet. Without this the panel would
// silently drop exactly the errors that are hardest to debug.
export const unmatchedErrorKeys = (
  errorKeys: readonly string[],
  leaves: readonly string[],
): readonly string[] => {
  const covered = new Set(leaves);
  return errorKeys.filter((key) => !covered.has(key));
};
