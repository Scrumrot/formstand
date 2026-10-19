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
  // Numbers compare with `===` semantics on top of Object.is: Object.is
  // alone keeps NaN equal to itself (wanted) but tells -0 from 0, and a
  // number input renders both as "0", so a field holding -0 against an
  // initial 0 read as permanently dirty with nothing visible to undo.
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (a instanceof Date && b instanceof Date) {
    // Two invalid Dates are equal: their timestamps are both NaN, which
    // `===` denies, so a cleared or half-typed date against an invalid
    // initial read as dirty forever.
    const [ta, tb] = [a.getTime(), b.getTime()];
    return ta === tb || (Number.isNaN(ta) && Number.isNaN(tb));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    // hasOwn matters: equal counts don't imply equal key SETS. Without it,
    // { realname: undefined } vs { nickname: "Ann" } passes (1 === 1, and
    // a.realname === missing b.realname === undefined) without b's real key
    // ever being inspected — dirty tracking would read a real change as
    // clean. With hasOwn plus the length check the key sets must match, so
    // the compare is also symmetric.
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((k) => Object.hasOwn(b, k) && valuesEqual(a[k], b[k]))
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
