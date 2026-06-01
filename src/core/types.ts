import type { ValidationMode } from "./mode";

export type ErrorMap = Readonly<Record<string, readonly string[]>>;

export type BoolMap = Readonly<Record<string, boolean>>;

export type FormState<TValues> = Readonly<{
  values: TValues;
  initialValues: TValues;
  errors: ErrorMap;
  touched: BoolMap;
  dirty: BoolMap;
  isSubmitting: boolean;
  submitCount: number;
  isValidating: BoolMap;
  mode: ValidationMode;
  reValidateMode: ValidationMode;
}>;
