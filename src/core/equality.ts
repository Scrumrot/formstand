export const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

// Structural equality used to decide whether a field still matches its initial
// value. Recurses into arrays and plain objects; Dates compare by timestamp
// (re-picking the same date must not leave the field permanently dirty);
// other exotic objects fall back to Object.is so a real change is never
// mistaken for "unchanged".
export const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((k) => valuesEqual(a[k], b[k]))
    );
  }
  return false;
};

// The deep compare for a container-valued field runs inside store selectors
// and watch subscriptions, i.e. on every store change — cache verdicts per
// value object, keyed by the initial-slice reference each was computed for.
// A small list (not a single slot) so distinct fields/forms sharing one value
// object (a module-level default, a shared sentinel array) coexist instead of
// evicting each other; bounded so no entry grows without limit. Form state is
// immutable, so identical references always mean an identical verdict, and
// the WeakMap releases everything when the value object dies.
type DirtyVerdict = Readonly<{ initial: unknown; dirty: boolean }>;
const dirtyCache = new WeakMap<object, readonly DirtyVerdict[]>();
const MAX_VERDICTS = 4;

// The single definition of dirtiness: the current value slice differs
// structurally from its initial-values slice. Derived (rather than tracked by
// writers) so reads are accurate at any depth.
export const isFieldDirty = (value: unknown, initialValue: unknown): boolean => {
  if (Object.is(value, initialValue)) return false;
  if (typeof value !== "object" || value === null) {
    return !valuesEqual(value, initialValue);
  }
  const cached = dirtyCache.get(value) ?? [];
  const hit = cached.find((v) => Object.is(v.initial, initialValue));
  if (hit !== undefined) return hit.dirty;
  const dirty = !valuesEqual(value, initialValue);
  dirtyCache.set(
    value,
    [{ initial: initialValue, dirty }, ...cached].slice(0, MAX_VERDICTS),
  );
  return dirty;
};
