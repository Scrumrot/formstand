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
// generic surface carrying a depth parameter (`D extends PathDepth`, or
// `D extends number` on FieldPath's compat surface) defaults to this
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

// True when T is a union of two or more members. The standard distribute-and-
// compare trick: U holds the whole union while T distributes, so any member
// that no longer covers U proves T had more than one. Used to reject a union
// depth both here (NormalizeDepth) and at the `pathDepth` option sites.
export type IsUnion<T, U = T> = [T] extends [never]
  ? false
  : T extends unknown
    ? [U] extends [T]
      ? false
      : true
    : never;

// Collapse every unusable D to the default budget BEFORE recursion starts:
// a widened `number`, an out-of-range literal (26, -1 — outside the Prev
// table, where `Prev[D]` is undefined and the decrement silently no-ops),
// and a finite union (9 | 12, or PathDepth itself — Prev distributes over
// unions, so the recursion would run to the union's max). Only a single
// in-range literal survives as itself. Checked in this order because
// `number` is not a union yet fails the PathDepth bound.
type NormalizeDepth<D extends number> = number extends D
  ? DefaultPathDepth
  : [D] extends [PathDepth]
    ? IsUnion<D> extends true
      ? DefaultPathDepth
      : D
    : DefaultPathDepth;

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
// The public alias normalizes D before recursing (NormalizeDepth above):
// anything other than a single in-range literal — a widened `number`, an
// out-of-range literal like 26 or -1, a finite union like 9 | 12 or
// PathDepth itself — falls back to the default budget. Without it, a
// widened or union D makes `Prev[D]` distribute across the table and the
// recursion effectively runs to the table's end — an enormous ~25-level
// union built silently (empirically verified hazard), or a hard TS2615 on
// recursive value types. D deliberately stays `extends number` (not
// PathDepth): this alias is the compat surface for direct users, so a wide
// D degrades to the default here instead of erroring.
export type FieldPath<T, D extends number = DefaultPathDepth> =
  FieldPathRec<T, NormalizeDepth<D>>;

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

// Tuples must resolve POSITIONALLY before the generic array arm runs: a
// tuple is a readonly unknown[] too, and `infer U` there unions every
// element, so "pair.0" into [string, number] would type as string | number.
// A tuple's keyof includes its index literals ("0" | "1" | ...), a plain
// array's does not, so `K extends keyof T` is exactly the tuple test.
type StepValue<T, K extends string> = T extends readonly (infer U)[]
  ? K extends keyof T
    ? T[K]
    : K extends `${number}`
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
