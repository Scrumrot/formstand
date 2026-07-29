import type { z } from "zod";
import { useStore } from "zustand/react";
import type { Form } from "../core/createForm";
import type { DefaultPathDepth, PathDepth } from "../core/fieldPath";
import type { FormStateApi } from "./useFormSelector";

// Whole-values subscription in render — sugar for
// useFormSelector(form, (s) => s.values), the render-side sibling of
// form.watchValues. The classic use is derived rendering driven by live
// form values (a map re-rendering as coordinates are edited).
//
// Deliberately NOT shallow-compared: the store replaces the values object
// immutably on every value change, so reference equality (useStore's
// default Object.is) is exactly right — one comparison, re-render if and
// only if some value changed. Unrelated state changes (touched, errors,
// isSubmitting) leave the values reference alone and cause no re-render.

export function useFormValues<
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
>(form: Form<TSchema, D>): z.input<TSchema>;
// The `schema?: undefined` brand forces Form<TSchema> (which has a real
// `schema` property) to bind only the typed overload above — same rule as
// useFormSelector. Structural forms have nothing to infer from and read
// `unknown`.
export function useFormValues(
  form: FormStateApi & { readonly schema?: undefined },
): unknown;
export function useFormValues(form: FormStateApi): unknown {
  return useStore(form.store, (state) => state.values);
}
