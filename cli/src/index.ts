// Programmatic API for formstand-cli.
export { fromZod, isZodSchema } from "./fromZod";
export { fromType } from "./fromType";
export type { FromTypeResult } from "./fromType";
export {
  emitInitialValues,
  emitZodSchema,
  emitPlainForm,
  emitMuiForm,
  emitShadcnForm,
} from "./codegen";
export type { SchemaImport, EmitFormOptions } from "./codegen";
export { emitModuleForm, joinModuleFiles } from "./moduleLayout";
export type { EmitModuleOptions, ModuleFile } from "./moduleLayout";
export { labelFromName } from "./ir";
export { defineConfig } from "./config";
export type { FormstandConfig } from "./config";
export type { FieldSpec, NamedField, SharedSpecProps } from "./ir";
