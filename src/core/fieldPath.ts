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

export type FieldPath<T> = IsArray<T> extends true
  ? T extends readonly (infer U)[]
    ?
        | `${number}`
        | (IsRecord<U> extends true
            ? `${number}.${FieldPath<U>}`
            : IsArray<U> extends true
              ? `${number}.${FieldPath<U>}`
              : never)
    : never
  : IsRecord<T> extends true
    ? {
        [K in keyof T & string]:
          | K
          | (IsRecord<T[K]> extends true
              ? `${K}.${FieldPath<T[K]>}`
              : IsArray<T[K]> extends true
                ? `${K}.${FieldPath<T[K]>}`
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

export type FieldValue<T, P extends string> = P extends `${infer Head}.${infer Tail}`
  ? FieldValue<StepValue<T, Head>, Tail>
  : StepValue<T, P>;
