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
export type FieldPath<T, D extends number = 9> = [D] extends [0]
  ? never
  : IsArray<T> extends true
    ? T extends readonly (infer U)[]
      ?
          | `${number}`
          | (IsRecord<NonNullable<U>> extends true
              ? `${number}.${FieldPath<NonNullable<U>, Prev[D]>}`
              : IsArray<NonNullable<U>> extends true
                ? `${number}.${FieldPath<NonNullable<U>, Prev[D]>}`
                : never)
      : never
    : IsRecord<T> extends true
      ? {
          [K in keyof T & string]:
            | K
            | (IsRecord<NonNullable<T[K]>> extends true
                ? `${K}.${FieldPath<NonNullable<T[K]>, Prev[D]>}`
                : IsArray<NonNullable<T[K]>> extends true
                  ? `${K}.${FieldPath<NonNullable<T[K]>, Prev[D]>}`
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
