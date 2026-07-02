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

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

// Recursion steps strip null/undefined (NonNullable) so paths inside optional
// objects/arrays ("profile.name" for `profile?: {...}`) are still addressable;
// FieldValue re-adds `| undefined` for values reached through an optional
// level.
export type FieldPath<T, D extends number = 7> = [D] extends [0]
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
