import { useCallback, useEffect, useMemo, useRef } from "react";
import type { z } from "zod";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import type { Form } from "../core/createForm";
import { valuesEqual } from "../core/equality";
import type { FieldPath, FieldValue } from "../core/fieldPath";
import { shouldValidateOn } from "../core/mode";
import { getAtPath } from "../core/path";
import type { FormState } from "../core/types";
import {
  type FieldValidationResult,
  isAsyncRequiredError,
} from "../core/validation";

type ReadonlyStore<T> = Pick<
  StoreApi<T>,
  "getState" | "getInitialState" | "subscribe"
>;

// Method (shorthand) syntax on purpose: method parameters are checked
// bivariantly, so a Form<TSchema> — whose write methods take the narrower
// FieldPath<...> instead of string — still satisfies this API. Prefer calling
// these through a typed Form when you have one.
export type FieldFormApi = Readonly<{
  store: ReadonlyStore<FormState<unknown>>;
  setValue(path: string, value: unknown): void;
  setTouched(path: string, touched?: boolean): void;
  setError(path: string, errors: readonly string[]): void;
  clearErrors(path?: string): void;
  validateField(path: string): FieldValidationResult;
  validateFieldAsync(path: string): Promise<FieldValidationResult>;
}>;

export type FieldPathArg<TValues> =
  | string
  | ((state: FormState<TValues>) => string);

export type UseFieldOptions = Readonly<{
  debounceMs?: number;
}>;

export type UseFieldReturn<TValue> = Readonly<{
  // The resolved field path — useful as an input's `name` attribute (the
  // bound prop builders spread it as `name`).
  path: string;
  value: TValue;
  error: readonly string[] | undefined;
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
  setValue: (value: TValue) => void;
  setTouched: (touched?: boolean) => void;
  setError: (errors: readonly string[]) => void;
  clearError: () => void;
  validate: () => FieldValidationResult;
  validateAsync: () => Promise<FieldValidationResult>;
  onBlur: () => void;
}>;

type FieldSlice<TValue> = Readonly<{
  path: string;
  value: TValue;
  error: readonly string[] | undefined;
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
}>;

export function useField<
  TSchema extends z.ZodType,
  P extends FieldPath<z.input<TSchema>>,
>(
  form: Form<TSchema>,
  path: P,
  options?: UseFieldOptions,
): UseFieldReturn<FieldValue<z.input<TSchema>, P>>;
export function useField<TSchema extends z.ZodType>(
  form: Form<TSchema>,
  pathSelector: (state: FormState<z.input<TSchema>>) => string,
  options?: UseFieldOptions,
): UseFieldReturn<unknown>;
// The `schema?: undefined` brand below forces TS to bind the typed      no
// Form<TSchema> overloads above when a real Form is passed (Form has
// `schema: TSchema`, not undefined). Without it, a Form<TSchema> with
// an invalid path would silently fall through to this widened
// overload and return UseFieldReturn<unknown>.
export function useField<TValue = unknown>(
  form: FieldFormApi & { readonly schema?: undefined },
  path: string | ((state: FormState<unknown>) => string),
  options?: UseFieldOptions,
): UseFieldReturn<TValue>;
export function useField<TValue = unknown>(
  form: FieldFormApi,
  pathArg: string | ((state: FormState<unknown>) => string),
  options?: UseFieldOptions,
): UseFieldReturn<TValue> {
  const slice = useStore(
    form.store,
    useShallow((state): FieldSlice<TValue> => {
      const p =
        typeof pathArg === "function" ? pathArg(state) : pathArg;
      const value = getAtPath(state.values, p);
      return {
        path: p,
        value: value as TValue,
        error: state.errors[p],
        touched: state.touched[p] ?? false,
        // Derived from the values themselves — the form-level dirty map
        // records keys at whatever granularity the writer used (setValue:
        // leaf, setValues: top-level, array ops: base path), so an exact-key
        // lookup would misreport nested reads.
        dirty: !valuesEqual(value, getAtPath(state.initialValues, p)),
        isValidating: state.isValidating[p] ?? false,
      };
    }),
  );
  const path = slice.path;

  const debounceMs = options?.debounceMs;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [form, path, debounceMs]);

  const triggerValidate = useCallback(() => {
    if (debounceMs !== undefined && debounceMs > 0) {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void form.validateFieldAsync(path);
        debounceTimerRef.current = null;
      }, debounceMs);
      return;
    }
    try {
      form.validateField(path);
    } catch (e) {
      if (isAsyncRequiredError(e)) {
        void form.validateFieldAsync(path);
        return;
      }
      throw e;
    }
  }, [form, path, debounceMs]);

  const setValue = useCallback(
    (value: TValue) => {
      form.setValue(path, value);
      const state = form.store.getState();
      if (
        shouldValidateOn(
          "change",
          state.mode,
          state.reValidateMode,
          state.submitCount > 0,
          state.touched[path] ?? false,
        )
      ) {
        triggerValidate();
      }
    },
    [form, path, triggerValidate],
  );

  const setTouched = useCallback(
    (touched?: boolean) => form.setTouched(path, touched),
    [form, path],
  );

  const setError = useCallback(
    (errors: readonly string[]) => form.setError(path, errors),
    [form, path],
  );

  const clearError = useCallback(
    () => form.clearErrors(path),
    [form, path],
  );

  const validate = useCallback(() => form.validateField(path), [form, path]);

  const validateAsync = useCallback(
    () => form.validateFieldAsync(path),
    [form, path],
  );

  const onBlur = useCallback(() => {
    form.setTouched(path, true);
    const state = form.store.getState();
    if (
      shouldValidateOn(
        "blur",
        state.mode,
        state.reValidateMode,
        state.submitCount > 0,
        true,
      )
    ) {
      triggerValidate();
    }
  }, [form, path, triggerValidate]);

  return useMemo(
    () => ({
      path: slice.path,
      value: slice.value,
      error: slice.error,
      touched: slice.touched,
      dirty: slice.dirty,
      isValidating: slice.isValidating,
      setValue,
      setTouched,
      setError,
      clearError,
      validate,
      validateAsync,
      onBlur,
    }),
    [slice, setValue, setTouched, setError, clearError, validate, validateAsync, onBlur],
  );
}
