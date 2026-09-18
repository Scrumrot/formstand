export { createForm } from "./core/createForm";
export type {
  Form,
  CreateFormOptions,
  SubmitHandler,
  InvalidSubmitHandler,
  SubmitOptions,
  SubmitResult,
  ResetOptions,
  ReadonlyStoreApi,
  FieldSnapshot,
} from "./core/createForm";
export type { FormState, ErrorMap, BoolMap } from "./core/types";
export { parsePath, getAtPath, setAtPath } from "./core/path";
export type { PathSegment } from "./core/path";
export type {
  DefaultPathDepth,
  FieldPath,
  FieldValue,
  PathDepth,
} from "./core/fieldPath";
export {
  flattenIssues,
  validateSync,
  validateAsync,
  isAsyncRequiredError,
  // The schema-introspection rule behind useField's emptyValue — exported so
  // adapters for other UI kits can share it (like numberToInputText /
  // parseNumberText below).
  emptyValueForSchema,
  isClearableSchema,
} from "./core/validation";
export type {
  ValidationResult,
  SettledValidationResult,
  FieldValidationResult,
  SettledFieldValidationResult,
  FieldsValidationResult,
  SettledFieldsValidationResult,
} from "./core/validation";
export { shouldValidateOn } from "./core/mode";
export type { ValidationMode, ValidationTrigger } from "./core/mode";
export { persistForm } from "./core/persist";
// The React lifecycle wrapper: owns the mount/dispose effect (StrictMode
// safe) and returns a reference-stable handle.
export { usePersistForm } from "./react/usePersistForm";
export type {
  PersistStorage,
  PersistOptions,
  PersistHandle,
} from "./core/persist";

export { useForm } from "./react/useForm";
// The raw-text editing pattern behind useNumberInput, generalized to any
// parsed/formatted value (phone, currency, locale formats).
export { useMaskedInput } from "./react/useMaskedInput";
export type {
  MaskedInputBinding,
  MaskedInputOptions,
  MaskedParse,
} from "./react/useMaskedInput";
// The multi-step (wizard) hook: per-step validation scopes over one form.
export { useFormSteps } from "./react/useFormSteps";
export type {
  FormStep,
  StepStatus,
  UseFormStepsReturn,
} from "./react/useFormSteps";
// The React 19 form-actions bridge: <form action> / useActionState with
// schema-validated data and the full submit lifecycle.
export {
  useFormAction,
  useFormActionState,
} from "./react/useFormAction";
export type {
  FormActionHandler,
  FormActionStateHandler,
  FormActionOptions,
} from "./react/useFormAction";
export { createFormContext } from "./react/FormContext";
export { createFormHooks } from "./react/createFormHooks";
export type {
  BoundUseField,
  BoundUseFieldArray,
  BoundUseFlag,
  BoundUseSelector,
  FormHooks,
} from "./react/createFormHooks";
export type {
  FormProviderProps,
  FormContextApi,
} from "./react/FormContext";
export {
  useFormSelector,
  useFormSelectorShallow,
} from "./react/useFormSelector";
export type { FormStateApi } from "./react/useFormSelector";
export { useFormValues } from "./react/useFormValues";
export { useFormError } from "./react/useFormError";
export {
  useIsDirty,
  useIsValid,
  useIsValidating,
  useIsSubmitting,
  useSubmitCount,
} from "./react/useFormFlags";
export { useField } from "./react/useField";
// Composite fields: one control over several schema paths, with a combined
// error channel — see useFields' header for the stable-arity contract.
export { useFields, type UseFieldsReturn } from "./react/useFields";
export { useVariantField } from "./react/useVariantField";
export type {
  UnionValueAt,
  VariantFieldPath,
  VariantFieldValue,
  VariantKeys,
} from "./react/useVariantField";
export type {
  UseFieldReturn,
  FieldFormApi,
  FieldPathArg,
  UseFieldOptions,
} from "./react/useField";
export {
  TextField,
  NumberField,
  DateField,
  CheckboxField,
  SelectField,
  // The text-preserving number binding behind NumberField — exported for
  // custom number inputs and UI-kit adapters (a naive controlled
  // value={String(n)} input eats "." and "-" as they're typed).
  useNumberInput,
} from "./react/fields";
export type {
  NumberInputBinding,
  TextFieldProps,
  NumberFieldProps,
  DateFieldProps,
  CheckboxFieldProps,
  SelectFieldProps,
  SelectFieldOption,
  FieldRef,
  PathsOf,
} from "./react/fields";
export { focusFirstError, focusField } from "./react/focusError";
export { useFieldArray } from "./react/useFieldArray";
export type {
  UseFieldArrayReturn,
  FieldArrayFormApi,
  FieldArrayEntry,
} from "./react/useFieldArray";
export {
  textInputProps,
  numberInputProps,
  dateInputProps,
  checkboxProps,
  selectProps,
  // The number/date text rules the built-in bindings use — exported so
  // adapters for other UI kits (MUI, etc.) can share them instead of
  // re-deriving. hasFieldError is the matching "does this field show an
  // error" predicate.
  numberToInputText,
  parseNumberText,
  dateToInputText,
  parseDateText,
  hasFieldError,
} from "./react/inputProps";
export type {
  TextInputProps,
  NumberInputProps,
  DateInputProps,
  CheckboxProps,
  SelectProps,
  ParsedNumberText,
  ParsedDateText,
} from "./react/inputProps";
