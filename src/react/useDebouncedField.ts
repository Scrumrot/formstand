import { useCallback, useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand/react";
import { shouldValidateOn } from "../core/mode";
import type { FormState } from "../core/types";
import {
  type FieldFormApi,
  type UseFieldReturn,
  useField,
} from "./useField";

export type UseDebouncedFieldOptions = Readonly<{
  delayMs: number;
}>;

export const useDebouncedField = <TValue = unknown>(
  form: FieldFormApi,
  pathArg: string | ((state: FormState<unknown>) => string),
  options: UseDebouncedFieldOptions,
): UseFieldReturn<TValue> => {
  const path = useStore(form.store, (state) =>
    typeof pathArg === "function" ? pathArg(state) : pathArg,
  );
  const field = useField<TValue>(
    form as FieldFormApi & { readonly schema?: undefined },
    path,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { delayMs } = options;

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [form, path]);

  const setValue = useCallback(
    (value: TValue) => {
      form.setValue(path, value);
      const state = form.store.getState();
      if (
        !shouldValidateOn(
          "change",
          state.mode,
          state.reValidateMode,
          state.submitCount > 0,
        )
      ) {
        return;
      }
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void form.validateFieldAsync(path);
        timerRef.current = null;
      }, delayMs);
    },
    [form, path, delayMs],
  );

  return useMemo(() => ({ ...field, setValue }), [field, setValue]);
};
