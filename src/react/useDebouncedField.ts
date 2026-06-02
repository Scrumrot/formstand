import type { FormState } from "../core/types";
import {
  type FieldFormApi,
  type UseFieldReturn,
  useField,
} from "./useField";

export type UseDebouncedFieldOptions = Readonly<{
  delayMs: number;
}>;

/**
 * @deprecated Use `useField(form, path, { debounceMs })` instead.
 */
export const useDebouncedField = <TValue = unknown>(
  form: FieldFormApi,
  pathArg: string | ((state: FormState<unknown>) => string),
  options: UseDebouncedFieldOptions,
): UseFieldReturn<TValue> =>
  useField<TValue>(
    form as FieldFormApi & { readonly schema?: undefined },
    pathArg,
    { debounceMs: options.delayMs },
  );
