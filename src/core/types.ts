import type { ValidationMode } from "./mode";

export type ErrorMap = Readonly<Record<string, readonly string[]>>;

export type BoolMap = Readonly<Record<string, boolean>>;

// No dirty map: dirtiness is derived (a field is dirty when its value slice
// differs structurally from initialValues), so it can't drift from the values
// the way a writer-maintained map can. See isFieldDirty / dirtyFields().
export type FormState<TValues> = Readonly<{
  values: TValues;
  initialValues: TValues;
  // The user-visible error map, derived whenever either channel below is
  // written: the schema's message wins at a key, server entries show where
  // the schema is silent. Root-level messages (schema-wide refine, form-level
  // server failure) live at the "" key. Never write this directly — write
  // the channels.
  errors: ErrorMap;
  // Validation-owned: rebuilt by every full pass, spliced by field-scoped
  // passes. Apps never write it.
  schemaErrors: ErrorMap;
  // App-owned (setError/setErrors/clearErrors): validation never touches it,
  // so a background pass can't wipe a "username taken" verdict. An entry
  // releases when the value on its spine changes (the path, a descendant, or
  // an ancestor), when a field-scoped validation targets its path, or via
  // clearErrors/reset/adoptValues.
  serverErrors: ErrorMap;
  touched: BoolMap;
  isSubmitting: boolean;
  submitCount: number;
  isValidating: BoolMap;
  // Whole-form async validation in flight (validateAsync / async submit path).
  // Field-level passes use per-path keys in `isValidating`.
  isValidatingForm: boolean;
  mode: ValidationMode;
  reValidateMode: ValidationMode;
}>;
