type LeafType =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | RegExp;

type IsRecord<T> = T extends LeafType
  ? false
  : T extends readonly unknown[]
    ? false
    : T extends object
      ? true
      : false;

type IsArray<T> = T extends readonly unknown[] ? true : false;

// Decrement table for the depth budget. Its length bounds the largest
// usable `pathDepth`: indices 0..25 support budgets up to D = 25 (already
// far past what the compiler enjoys — see FieldPath's doc below).
type Prev = [
  never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
];

// The library-wide default typed-path depth budget, in segments. Every
// generic surface carrying a `D extends number` parameter defaults to this
// alias — one source of truth instead of a literal repeated per signature.
export type DefaultPathDepth = 9;

// The legal values of the `pathDepth` OPTION — exactly the indices of the
// Prev table above, so every admissible budget has a decrement. Constraining
// the option to this union makes `pathDepth: 26`, `pathDepth: -1`, and a
// widened `number`-typed variable compile errors at the call site instead of
// silently producing an out-of-range or wide-open FieldPath union.
export type PathDepth =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25;

// Recursion steps strip null/undefined (NonNullable) so paths inside optional
// objects/arrays ("profile.name" for `profile?: {...}`) are still addressable;
// FieldValue re-adds `| undefined` for values reached through an optional
// level.
//
// D counts SEGMENTS, not recursion steps: one D is spent per dot-separated
// segment (each record key or array index), so at D = 1 only single-segment
// paths bind and the default D = 9 admits paths up to 9 segments — the same
// counting formstand-cli's depth budget uses. The cap is a TS compile-cost
// guardrail (the union's size grows with every level the type recurses
// into), not a runtime limit: the path runtime walks any depth. Forms can
// widen or narrow it per form via createForm's `pathDepth` option.
// The public alias guards against a NON-LITERAL D: when D has widened to
// `number` (an options object built separately, a `Form<S, number>` floating
// through a helper), `Prev[number]` collapses to the whole table's union and
// the recursion effectively runs to the table's end — an enormous ~25-level
// union built silently (empirically verified hazard). `number extends D`
// detects the widening and falls back to the default budget instead.
export type FieldPath<T, D extends number = DefaultPathDepth> =
  number extends D ? FieldPathRec<T, DefaultPathDepth> : FieldPathRec<T, D>;

type FieldPathRec<T, D extends number> = [D] extends [0]
  ? never
  : IsArray<T> extends true
    ? T extends readonly (infer U)[]
      ?
          | `${number}`
          | (IsRecord<NonNullable<U>> extends true
              ? `${number}.${FieldPathRec<NonNullable<U>, Prev[D]>}`
              : IsArray<NonNullable<U>> extends true
                ? `${number}.${FieldPathRec<NonNullable<U>, Prev[D]>}`
                : never)
      : never
    : IsRecord<T> extends true
      ? {
          [K in keyof T & string]:
            | K
            | (IsRecord<NonNullable<T[K]>> extends true
                ? `${K}.${FieldPathRec<NonNullable<T[K]>, Prev[D]>}`
                : IsArray<NonNullable<T[K]>> extends true
                  ? `${K}.${FieldPathRec<NonNullable<T[K]>, Prev[D]>}`
                  : never);
        }[keyof T & string]
      : never;

type StepValue<T, K extends string> = T extends readonly (infer U)[]
  ? K extends `${number}`
    ? U
    : never
  : T extends object
    ? K extends keyof T
      ? T[K]
      : never
    : never;

// Mirrors FieldPath's NonNullable stepping: when a traversed level is
// optional/nullable, descend into its non-null shape and widen the result
// with `| undefined` (the parent may be absent at runtime).
export type FieldValue<T, P extends string> = [T] extends [NonNullable<T>]
  ? P extends `${infer Head}.${infer Tail}`
    ? FieldValue<StepValue<T, Head>, Tail>
    : StepValue<T, P>
  : FieldValue<NonNullable<T>, P> | undefined;
