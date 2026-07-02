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
  // Whole-form async validation in flight (validateAsync / async submit path).
  // Field-level passes use per-path keys in `isValidating`.
  isValidatingForm: boolean;
  mode: ValidationMode;
  reValidateMode: ValidationMode;
}>;
