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
// and watch subscriptions, i.e. on every store change — cache the verdict per
// value object against the initial-slice reference it was computed for. Form
// state is immutable, so identical references always mean an identical
// verdict; the WeakMap lets discarded value objects release their entries.
const dirtyCache = new WeakMap<
  object,
  Readonly<{ initial: unknown; dirty: boolean }>
>();

// The single definition of per-field dirtiness: the field's current value
// slice differs structurally from its initial-values slice. Derived (rather
// than read from the form-level dirty map) so reads are accurate at any
// depth, regardless of which writer (setValue/setValues/array op) recorded
// dirtiness in the map.
export const isFieldDirty = (value: unknown, initialValue: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return !valuesEqual(value, initialValue);
  }
  const cached = dirtyCache.get(value);
  if (cached !== undefined && Object.is(cached.initial, initialValue)) {
    return cached.dirty;
  }
  const dirty = !valuesEqual(value, initialValue);
  dirtyCache.set(value, { initial: initialValue, dirty });
  return dirty;
};
