import type { z } from "zod";
import type { Form } from "../core/createForm";
import type { FieldPath, FieldValue } from "../core/fieldPath";
import type { FormState } from "../core/types";
import {
  type FieldFormApi,
  type UseFieldOptions,
  type UseFieldReturn,
  useField,
} from "./useField";
import {
  type ArrayItemOf,
  type FieldArrayFormApi,
  type UseFieldArrayReturn,
  useFieldArray,
} from "./useFieldArray";
import { useFormError } from "./useFormError";
import {
  useIsDirty,
  useIsSubmitting,
  useIsValid,
  useSubmitCount,
} from "./useFormFlags";
import {
  type FormStateApi,
  useFormSelector,
  useFormSelectorShallow,
} from "./useFormSelector";

// createFormHooks(form, name?) — every hook, pre-wired to one form. The
// context-free way to share a form: create it at module scope, export the
// returned hooks, and no component ever passes `form` through props or a
// provider. The optional name is baked into the hook names (both at the
// type level and at runtime), so a module reads like a domain API:
//
//   const form = createForm(invoiceSchema, { initialValues });
//   export const { useInvoiceField, useInvoiceFieldArray, useInvoiceIsDirty } =
//     createFormHooks(form, "invoice");
//
// Typed paths survive the binding: useInvoiceField("customer") infers the
// value type from the schema, and a typo'd path is a compile error.
//
// Reach for this when the form is a genuine module-level singleton (one
// instance for the app's lifetime — settings, a global compose box). For a
// form that mounts per page/dialog with its own lifecycle, use useForm and
// createFormContext instead: a module singleton never unmounts, so state
// persists across navigations until you reset() it.

// The bound signatures mirror the unbound hooks minus the form parameter;
// the typed-path call signature sits last for the same error-blame reason
// as the originals.
export type BoundUseField<TSchema extends z.ZodType> = {
  (
    pathSelector: (state: FormState<z.input<TSchema>>) => string,
    options?: UseFieldOptions,
  ): UseFieldReturn<unknown>;
  <P extends FieldPath<z.input<TSchema>>>(
    path: P,
    options?: UseFieldOptions,
  ): UseFieldReturn<FieldValue<z.input<TSchema>, P>>;
};

export type BoundUseFieldArray<TSchema extends z.ZodType> = {
  (
    pathSelector: (state: FormState<z.input<TSchema>>) => string,
  ): UseFieldArrayReturn<unknown>;
  <P extends FieldPath<z.input<TSchema>>>(
    path: P,
  ): UseFieldArrayReturn<ArrayItemOf<FieldValue<z.input<TSchema>, P>>>;
};

export type BoundUseSelector<TSchema extends z.ZodType> = <U>(
  selector: (state: FormState<z.input<TSchema>>) => U,
) => U;

export type BoundUseFlag<TSchema extends z.ZodType> = (
  path?: FieldPath<z.input<TSchema>>,
) => boolean;

// One single-key mapped type per hook, intersected: template-literal keys
// carry the capitalized name, so the destructured names are typo-checked
// ({ useInvoceField } fails to compile against createFormHooks(f, "invoice")).
export type FormHooks<TSchema extends z.ZodType, N extends string> = Readonly<
  { [K in `use${Capitalize<N>}Field`]: BoundUseField<TSchema> } & {
    [K in `use${Capitalize<N>}FieldArray`]: BoundUseFieldArray<TSchema>;
  } & { [K in `use${Capitalize<N>}Selector`]: BoundUseSelector<TSchema> } & {
    [K in `use${Capitalize<N>}SelectorShallow`]: BoundUseSelector<TSchema>;
  } & {
    [K in `use${Capitalize<N>}Error`]: () => readonly string[] | undefined;
  } & { [K in `use${Capitalize<N>}IsDirty`]: BoundUseFlag<TSchema> } & {
    [K in `use${Capitalize<N>}IsValid`]: BoundUseFlag<TSchema>;
  } & { [K in `use${Capitalize<N>}IsSubmitting`]: () => boolean } & {
    [K in `use${Capitalize<N>}SubmitCount`]: () => number;
  }
>;

// Runtime twin of TypeScript's Capitalize<N> (ASCII names; a leading
// non-letter passes through unchanged in both).
const capitalize = (name: string): string =>
  name.length === 0 ? name : name.charAt(0).toUpperCase() + name.slice(1);

export const createFormHooks = <
  TSchema extends z.ZodType,
  N extends string = "",
>(
  form: Form<TSchema>,
  name?: N,
): FormHooks<TSchema, N> => {
  // Calling the unbound hooks through a structural view (no `schema`
  // property) binds their widened overloads — the precise typing is
  // re-established by the Bound* signatures above, which the type tests pin.
  const structural: FieldFormApi & FieldArrayFormApi & FormStateApi = form;

  const useBoundField = (
    path: string | ((state: FormState<unknown>) => string),
    options?: UseFieldOptions,
  ): UseFieldReturn<unknown> => useField(structural, path, options);

  const useBoundFieldArray = (
    path: string | ((state: FormState<unknown>) => string),
  ): UseFieldArrayReturn<unknown> => useFieldArray(structural, path);

  const useBoundSelector = <U,>(
    selector: (state: FormState<unknown>) => U,
  ): U => useFormSelector(structural, selector);

  const useBoundSelectorShallow = <U,>(
    selector: (state: FormState<unknown>) => U,
  ): U => useFormSelectorShallow(structural, selector);

  const useBoundError = (): readonly string[] | undefined =>
    useFormError(structural);

  const useBoundIsDirty = (path?: string): boolean =>
    useIsDirty(structural, path);

  const useBoundIsValid = (path?: string): boolean =>
    useIsValid(structural, path);

  const useBoundIsSubmitting = (): boolean => useIsSubmitting(structural);

  const useBoundSubmitCount = (): number => useSubmitCount(structural);

  const prefix = capitalize(name ?? "");
  // Computed keys erase to an index signature, so the literal is asserted
  // to the mapped FormHooks type — the real contract, verified by type
  // tests on both the key names and the bound signatures.
  return {
    [`use${prefix}Field`]: useBoundField,
    [`use${prefix}FieldArray`]: useBoundFieldArray,
    [`use${prefix}Selector`]: useBoundSelector,
    [`use${prefix}SelectorShallow`]: useBoundSelectorShallow,
    [`use${prefix}Error`]: useBoundError,
    [`use${prefix}IsDirty`]: useBoundIsDirty,
    [`use${prefix}IsValid`]: useBoundIsValid,
    [`use${prefix}IsSubmitting`]: useBoundIsSubmitting,
    [`use${prefix}SubmitCount`]: useBoundSubmitCount,
  } as FormHooks<TSchema, N>;
};
