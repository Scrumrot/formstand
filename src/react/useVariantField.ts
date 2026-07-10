import type { z } from "zod";
import type { Form } from "../core/createForm";
import { type FieldFormApi, type UseFieldReturn, useField } from "./useField";

// Discriminated-union support. A z.discriminatedUnion field types its value
// as a union of variant objects, and FieldPath<T> only exposes the keys
// COMMON to every union member (via `keyof T`) — so the DISCRIMINANT binds
// with plain useField (it's common), but a variant-specific field
// ("payment.cardNumber", present only in the card branch) resolves to a
// path FieldPath omits. useVariantField is the typed accessor for those.
//
// It binds `${unionPath}.${field}` and types the result as the field's value
// across every variant that declares it, widened with `| undefined` because
// the field is absent while a different variant is active:
//
//   const method = useField(form, "payment.method");        // discriminant
//   const cardNumber = useVariantField(form, "payment", "cardNumber");
//   // -> UseFieldReturn<string | undefined>, rendered when method.value === "card"
//
// The hook is called unconditionally (React's rules) — every variant's
// fields bind every render; you render the matching ones based on the
// discriminant. Runtime behavior is exactly useField on the joined path.
//
// Gate WRITES on the discriminant too, not just rendering: the returned
// setter writes `${unionPath}.${field}` regardless of the active variant, so
// calling a card field's setValue while the paypal variant is active injects
// a stray key into the stored object. z.discriminatedUnion strips it on
// parse (validation looks clean), but dirtyFields()/persistForm see the
// polluted shape. Render the matching fields only — as the example shows —
// and their setters fire only for the active variant. formstand-gen's output
// follows this; hand-written forms must too.

// The value of `field` across the members of union `V` that declare it.
// Distributes over V: each member contributes V[field] when it has field,
// never otherwise; the union of those is the result. `| undefined` is added
// by the caller (the field is absent while another variant is active).
export type VariantFieldValue<V, TField extends string> = V extends unknown
  ? TField extends keyof V
    ? V[TField]
    : never
  : never;

// The variant-only field keys of union `V`: every member's keys minus the
// keys shared by all members (the discriminant and any other common field,
// which bind with plain useField). `keyof V` on a union is ALREADY the
// common keys (the intersection) — it must NOT distribute, or it would
// equal AllKeys and leave no variant keys. AllKeys distributes to collect
// every member's keys.
type CommonKeys<V> = keyof V;
type AllKeys<V> = V extends unknown ? keyof V : never;
export type VariantKeys<V> = Exclude<AllKeys<V>, CommonKeys<V>> & string;

// The paths in `TValues` whose value is a discriminated union — an object
// whose members don't all share the same keys. Kept permissive (any
// top-level or nested key reaching a union of objects); misuse on a
// non-union path yields `never` field keys, so the call simply won't
// typecheck a field argument.
export type UnionValueAt<TValues, P extends string> = P extends keyof TValues
  ? // NonNullable is essential: for an OPTIONAL/nullable union field the
    // resolved value includes undefined, which collapses `keyof V` to never
    // — VariantKeys would then leak EVERY key (discriminant included) and
    // the whole guard inverts. Strip the nullish part first.
    NonNullable<TValues[P]>
  : P extends `${infer Head}.${infer Tail}`
    ? Head extends keyof TValues
      ? UnionValueAt<NonNullable<TValues[Head]>, Tail>
      : never
    : never;

export function useVariantField<
  TSchema extends z.ZodType,
  P extends string,
  TField extends VariantKeys<UnionValueAt<z.input<TSchema>, P>>,
>(
  form: Form<TSchema>,
  unionPath: P,
  field: TField,
): UseFieldReturn<
  VariantFieldValue<UnionValueAt<z.input<TSchema>, P>, TField> | undefined
>;
// Schema-less forms keep the plain-string, caller-typed shape.
export function useVariantField<TValue = unknown>(
  form: FieldFormApi & { readonly schema?: undefined },
  unionPath: string,
  field: string,
): UseFieldReturn<TValue | undefined>;
export function useVariantField(
  form: FieldFormApi,
  unionPath: string,
  field: string,
): UseFieldReturn<unknown> {
  // Structural string-path bind: the joined path is exactly what a variant
  // field lives at; only its TYPE was unreachable through FieldPath, so the
  // runtime is ordinary useField.
  return useField(
    form as FieldFormApi & { readonly schema?: undefined },
    `${unionPath}.${field}`,
  );
}
