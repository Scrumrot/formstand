import type { z } from "zod";
import type { Form } from "../core/createForm";
import type {
  ArrayFieldPath,
  ArrayItemOf,
  DefaultPathDepth,
  PathDepth,
} from "../core/fieldPath";
import {
  type FieldArrayFormApi,
  type UseFieldArrayReturn,
  useFieldArray,
} from "./useFieldArray";
import type { UnionValueAt, VariantFieldValue } from "./useVariantField";

// The array twin of useVariantField. A z.array that lives in ONE variant of
// a discriminated union ("asphalt" pavements have `lights`, "grass" ones do
// not) sits at a path FieldPath omits, since FieldPath on a union offers
// only the keys every member shares, so useFieldArray(form, "top.lights")
// is a compile error even though the runtime binding is ordinary. This hook
// binds `${unionPath}.${field}` and types the rows from the variants that
// declare the array:
//
//   const kind = useField(form, "top.kind");                 // discriminant
//   const lights = useVariantFieldArray(form, "top", "lights");
//   // -> UseFieldArrayReturn<{ color: string }>, rendered when kind.value === "asphalt"
//
// Like useVariantField, call it unconditionally and render the matching
// rows based on the discriminant; its ops write the variant path whatever
// the active variant is, so gate the UI, not the hook. Runtime behavior is
// exactly useFieldArray on the joined path, row ids included.
//
// The field argument is a variant sub-PATH, not just a key, the same way
// useVariantField's is: "lights", "spec.lights" (an array inside a
// variant-only object), or a row template such as `lights.${index}.bulbs`
// for an array nested in the rows of another variant array. formstand-gen
// emits this hook for arrays inside union variants, the one shape that
// used to degrade to a TODO.

// The variable-length array paths of union `V` that are NOT rooted at a
// common key. Built from the core's ArrayFieldPath, distributed over the
// members like VariantFieldPath distributes FieldPath, so optional and
// nullable arrays and template paths with numeric holes all qualify. A
// common-key array binds with plain useFieldArray, which types it from the
// union directly; offering it here would duplicate that hook.
export type VariantArrayFieldPath<
  V,
  D extends PathDepth = DefaultPathDepth,
> = Exclude<
  V extends unknown ? ArrayFieldPath<V, D> : never,
  (keyof V & string) | `${keyof V & string}.${string}`
> &
  string;

// The trap-guard sentinel, mirroring useVariantField's: an explicit type
// argument on a schema-typed form lands on the one-type-parameter overload
// below and reads the instruction instead of a baffling structural error.
declare const inferredCallsOnly: unique symbol;
interface InferredTypeArg {
  readonly [inferredCallsOnly]: typeof inferredCallsOnly;
}

// Overload order mirrors useVariantField: the trap guard first, the widened
// structural overload for schema-less forms next, the typed overload LAST
// so a bad union path or field on a Form<TSchema> is blamed on that
// argument against the real union.
export function useVariantFieldArray<TItem = InferredTypeArg>(
  form: FieldArrayFormApi & Readonly<{ schema: z.ZodType }>,
  unionPath: TItem extends InferredTypeArg
    ? never
    : "Remove the explicit type argument: a schema-typed form infers the item type from the union path and field",
  field: string,
): UseFieldArrayReturn<TItem>;
export function useVariantFieldArray<TItem = unknown>(
  form: FieldArrayFormApi & { readonly schema?: undefined },
  unionPath: string,
  field: string,
): UseFieldArrayReturn<TItem>;
// D is recovered from the form argument and sits last with a default, so
// explicit instantiation expressions keep their arity. TField's constraint
// uses the DEFAULT depth on purpose, the same reasoning as useVariantField:
// a constraint may not consume a later type parameter before inference
// resolves it, and variant subtrees are shallow by construction.
export function useVariantFieldArray<
  TSchema extends z.ZodType,
  P extends string,
  TField extends VariantArrayFieldPath<UnionValueAt<z.input<TSchema>, P>>,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  unionPath: P,
  field: TField,
): UseFieldArrayReturn<
  ArrayItemOf<VariantFieldValue<UnionValueAt<z.input<TSchema>, P>, TField>>
>;
export function useVariantFieldArray(
  form: FieldArrayFormApi,
  unionPath: string,
  field: string,
): UseFieldArrayReturn<unknown> {
  // Structural string-path bind: the joined path is exactly where the
  // variant's array lives; only its TYPE was unreachable through
  // ArrayFieldPath, so the runtime is ordinary useFieldArray.
  return useFieldArray(
    form as FieldArrayFormApi & { readonly schema?: undefined },
    `${unionPath}.${field}`,
  );
}
