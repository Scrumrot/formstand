// Programmatic API for formstand-cli.
export { fromZod, isZodSchema } from "./fromZod";
export { fromType } from "./fromType";
export type { FromTypeResult } from "./fromType";
export {
  emitInitialValues,
  emitZodSchema,
  emitPlainForm,
  emitMuiForm,
} from "./codegen";
export type { SchemaImport, EmitFormOptions } from "./codegen";
export { labelFromName } from "./ir";
export type { FieldSpec, NamedField, SharedSpecProps } from "./ir";
