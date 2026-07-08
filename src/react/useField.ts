import { useCallback, useEffect, useMemo, useRef } from "react";
import type { z } from "zod";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import type { Form } from "../core/createForm";
import { isFieldDirty } from "../core/equality";
import type { FieldPath, FieldValue } from "../core/fieldPath";
import { shouldValidateOn } from "../core/mode";
import { getAtPath } from "../core/path";
import type { FormState } from "../core/types";
import {
  type FieldValidationResult,
  emptyValueForSchema,
  fieldSchemaAtPath,
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
  setError(path: string, errors: string | readonly string[]): void;
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
  // The slice of initialValues at this path (what `dirty` compares against).
  initialValue: TValue;
  // What a cleared input writes back: null when the field's schema is
  // nullable (introspected when the form carries its schema — the zod-first
  // source of truth), undefined when it is optional or unknown. Falls back
  // to "the initial value was null" for schema-less FieldFormApi forms.
  emptyValue: null | undefined;
  error: readonly string[] | undefined;
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
  setValue: (value: TValue) => void;
  setTouched: (touched?: boolean) => void;
  // A single string is shorthand for a one-element array (like form.setError).
  setError: (errors: string | readonly string[]) => void;
  clearError: () => void;
  validate: () => FieldValidationResult;
  validateAsync: () => Promise<FieldValidationResult>;
  onBlur: () => void;
}>;

type FieldSlice<TValue> = Readonly<{
  path: string;
  value: TValue;
  initialValue: TValue;
  error: readonly string[] | undefined;
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
}>;

// Overload order is deliberate. When no overload matches, TypeScript reports
// the LAST candidate's error — so the typed-path overload sits last, and a
// typo'd path on a Form<TSchema> is blamed on the path argument against the
// full FieldPath union ('"naem"' is not assignable to '"name" | "age" | ...')
// instead of on the form argument.
export function useField<TSchema extends z.ZodType>(
  form: Form<TSchema>,
  pathSelector: (state: FormState<z.input<TSchema>>) => string,
  options?: UseFieldOptions,
): UseFieldReturn<unknown>;
// The `schema?: undefined` brand forces TS past this widened overload when a
// real Form is passed (Form has `schema: TSchema`, not undefined). Without
// it, a Form<TSchema> with an invalid path would silently bind here and
// return UseFieldReturn<unknown>.
export function useField<TValue = unknown>(
  form: FieldFormApi & { readonly schema?: undefined },
  path: string | ((state: FormState<unknown>) => string),
  options?: UseFieldOptions,
): UseFieldReturn<TValue>;
export function useField<
  TSchema extends z.ZodType,
  P extends FieldPath<z.input<TSchema>>,
>(
  form: Form<TSchema>,
  path: P,
  options?: UseFieldOptions,
): UseFieldReturn<FieldValue<z.input<TSchema>, P>>;
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
      const initialValue = getAtPath(state.initialValues, p);
      return {
        path: p,
        value: value as TValue,
        initialValue: initialValue as TValue,
        error: state.errors[p],
        touched: state.touched[p] ?? false,
        dirty: isFieldDirty(value, initialValue),
        isValidating: state.isValidating[p] ?? false,
      };
    }),
  );
  const path = slice.path;

  // Schema introspection wins over the runtime heuristic when the form
  // carries its schema (Form<TSchema> does; a bare FieldFormApi may not).
  const formSchema = (form as Readonly<{ schema?: z.ZodType }>).schema;
  const initialValue = slice.initialValue;
  const emptyValue = useMemo(() => {
    if (formSchema !== undefined) {
      const sub = fieldSchemaAtPath(formSchema, path);
      if (sub !== null) return emptyValueForSchema(sub);
    }
    return initialValue === null ? null : undefined;
  }, [formSchema, path, initialValue]);

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
    (errors: string | readonly string[]) => form.setError(path, errors),
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
      initialValue: slice.initialValue,
      emptyValue,
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
    [slice, emptyValue, setValue, setTouched, setError, clearError, validate, validateAsync, onBlur],
  );
}
