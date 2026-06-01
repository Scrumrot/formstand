import { useCallback, useMemo } from "react";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import { type ValidationMode, shouldValidateOn } from "../core/mode";
import { getAtPath } from "../core/path";
import type { FormState } from "../core/types";
import type { FieldValidationResult } from "../core/validation";

type ReadonlyStore<T> = Pick<
  StoreApi<T>,
  "getState" | "getInitialState" | "subscribe"
>;

export type FieldFormApi = Readonly<{
  store: ReadonlyStore<FormState<unknown>>;
  mode: ValidationMode;
  reValidateMode: ValidationMode;
  setValue: (path: string, value: unknown) => void;
  setTouched: (path: string, touched?: boolean) => void;
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

  const setValue = useCallback(
    (value: TValue) => {
      form.setValue(path, value);
      const submitAttempted = form.store.getState().submitCount > 0;
      if (
        shouldValidateOn("change", form.mode, form.reValidateMode, submitAttempted)
      ) {
        form.validateField(path);
      }
    },
    [form, path],
  );

  const setTouched = useCallback(
    (touched?: boolean) => form.setTouched(path, touched),
    [form, path],
  );

  const validate = useCallback(() => form.validateField(path), [form, path]);

  const validateAsync = useCallback(
    () => form.validateFieldAsync(path),
    [form, path],
  );

  const onBlur = useCallback(() => {
    form.setTouched(path, true);
    const submitAttempted = form.store.getState().submitCount > 0;
    if (
      shouldValidateOn("blur", form.mode, form.reValidateMode, submitAttempted)
    ) {
      form.validateField(path);
    }
  }, [form, path]);

  return useMemo(
    () => ({ ...slice, setValue, setTouched, validate, validateAsync, onBlur }),
    [slice, setValue, setTouched, validate, validateAsync, onBlur],
  );
};
