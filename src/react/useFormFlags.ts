import type { z } from "zod";
import { useStore } from "zustand/react";
import type { Form } from "../core/createForm";
import { isFieldDirty } from "../core/equality";
import type { FieldPath } from "../core/fieldPath";
import { getAtPath } from "../core/path";
import { isPathOrChild } from "../core/validation";
import type { FormStateApi } from "./useFormSelector";

// Both flag hooks take an optional path and scope to it with the same
// prefix semantics as the rest of the library (isPathOrChild): "shipping"
// covers "shipping.city". Omitted path = whole form. Overload order mirrors
// useField: the typed-path overload sits last so a typo'd path on a
// Form<TSchema> is blamed against the full FieldPath union, and the
// `schema?: undefined` brand keeps real Forms off the widened string
// overload. Subscriptions are boolean-only — the component re-renders when
// the flag flips, not on every keystroke (unlike useField(...).dirty).

// Derived from the values (memoized per values reference), so it always
// agrees with per-field dirty reads. The scoped form compares just the
// subtree at `path` — a missing path on both sides reads as clean.
export function useIsDirty(
  form: FormStateApi & { readonly schema?: undefined },
  path?: string,
): boolean;
export function useIsDirty<
  TSchema extends z.ZodType,
  P extends FieldPath<z.input<TSchema>>,
>(form: Form<TSchema>, path?: P): boolean;
export function useIsDirty(form: FormStateApi, path?: string): boolean {
  return useStore(form.store, (state) =>
    path === undefined || path === ""
      ? isFieldDirty(state.values, state.initialValues)
      : isFieldDirty(
          getAtPath(state.values, path),
          getAtPath(state.initialValues, path),
        ),
  );
}

// "No errors currently in the merged map" (not a fresh validation pass);
// the scoped form only looks at errors at or under `path`, including the
// path's own key (array-level errors like `items` count for path "items").
export function useIsValid(
  form: FormStateApi & { readonly schema?: undefined },
  path?: string,
): boolean;
export function useIsValid<
  TSchema extends z.ZodType,
  P extends FieldPath<z.input<TSchema>>,
>(form: Form<TSchema>, path?: P): boolean;
export function useIsValid(form: FormStateApi, path?: string): boolean {
  return useStore(form.store, (state) => {
    for (const k in state.errors) {
      const errs = state.errors[k];
      if (
        errs !== undefined &&
        errs.length > 0 &&
        (path === undefined || path === "" || isPathOrChild(k, path))
      ) {
        return false;
      }
    }
    return true;
  });
}

export const useIsSubmitting = (form: FormStateApi): boolean =>
  useStore(form.store, (state) => state.isSubmitting);

export const useSubmitCount = (form: FormStateApi): number =>
  useStore(form.store, (state) => state.submitCount);
