import type { ValidationMode } from "./mode";

export type ErrorMap = Readonly<Record<string, readonly string[]>>;

export type BoolMap = Readonly<Record<string, boolean>>;

// No dirty map: dirtiness is derived (a field is dirty when its value slice
// differs structurally from initialValues), so it can't drift from the values
// the way a writer-maintained map can. See isFieldDirty / dirtyFields().
export type FormState<TValues> = Readonly<{
  values: TValues;
  initialValues: TValues;
  errors: ErrorMap;
  touched: BoolMap;
  // Paths whose current error entry came from setError/setErrors (or an
  // errors patch via updateState) rather than a schema pass. Full-form
  // validation preserves these where the schema is silent; they release when
  // the field's value changes, a field-scoped validation targets them, or a
  // schema error supersedes them at the same key.
  manualErrors: BoolMap;
  isSubmitting: boolean;
  submitCount: number;
  isValidating: BoolMap;
  // Whole-form async validation in flight (validateAsync / async submit path).
  // Field-level passes use per-path keys in `isValidating`.
  isValidatingForm: boolean;
  mode: ValidationMode;
  reValidateMode: ValidationMode;
}>;
