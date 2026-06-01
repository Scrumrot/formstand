import { useCallback, useMemo } from "react";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import { shouldValidateOn } from "../core/mode";
import { getAtPath } from "../core/path";
import type { FormState } from "../core/types";
import type { FieldValidationResult } from "../core/validation";

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

export const useField = <TValue = unknown>(
  form: FieldFormApi,
  path: string,
): UseFieldReturn<TValue> => {
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
    } catch {
      void form.validateFieldAsync(path);
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
};
