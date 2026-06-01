import { useCallback, useMemo } from "react";
import type { z } from "zod";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import type { Form } from "../core/createForm";
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

export type FieldFormApi = Readonly<{
  store: ReadonlyStore<FormState<unknown>>;
  setValue: (path: string, value: unknown) => void;
  setTouched: (path: string, touched?: boolean) => void;
  setError: (path: string, errors: readonly string[]) => void;
  clearErrors: (path?: string) => void;
  validateField: (path: string) => FieldValidationResult;
  validateFieldAsync: (path: string) => Promise<FieldValidationResult>;
}>;

export type FieldPathArg<TValues> =
  | string
  | ((state: FormState<TValues>) => string);

export type UseFieldReturn<TValue> = Readonly<{
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
): UseFieldReturn<FieldValue<z.input<TSchema>, P>>;
export function useField<TSchema extends z.ZodType>(
  form: Form<TSchema>,
  pathSelector: (state: FormState<z.input<TSchema>>) => FieldPath<z.input<TSchema>>,
): UseFieldReturn<unknown>;
// The `schema?: undefined` brand below forces TS to bind the typed
// Form<TSchema> overloads above when a real Form is passed (Form has
// `schema: TSchema`, not undefined). Without it, a Form<TSchema> with
// an invalid path would silently fall through to this widened
// overload and return UseFieldReturn<unknown>.
export function useField<TValue = unknown>(
  form: FieldFormApi & { readonly schema?: undefined },
  path: string | ((state: FormState<unknown>) => string),
): UseFieldReturn<TValue>;
export function useField<TValue = unknown>(
  form: FieldFormApi,
  pathArg: string | ((state: FormState<unknown>) => string),
): UseFieldReturn<TValue> {
  const path = useStore(form.store, (state) =>
    typeof pathArg === "function" ? pathArg(state) : pathArg,
  );

  const slice = useStore(
    form.store,
    useShallow(
      (state): FieldSlice<TValue> => ({
        value: getAtPath(state.values, path) as TValue,
        error: state.errors[path],
        touched: state.touched[path] ?? false,
        dirty: state.dirty[path] ?? false,
        isValidating: state.isValidating[path] ?? false,
      }),
    ),
  );

  const triggerValidate = useCallback(() => {
    try {
      form.validateField(path);
    } catch (e) {
      if (isAsyncRequiredError(e)) {
        void form.validateFieldAsync(path);
        return;
      }
      throw e;
    }
  }, [form, path]);

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
      )
    ) {
      triggerValidate();
    }
  }, [form, path, triggerValidate]);

  return useMemo(
    () => ({
      ...slice,
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
