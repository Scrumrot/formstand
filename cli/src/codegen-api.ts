// The browser-safe codegen API — `formstand-cli/codegen`.
//
// Everything downstream of the IR is a pure string builder: no Node built-ins
// (fs/path), no jiti, no TypeScript compiler. So this surface runs anywhere —
// import it in a browser to generate form source client-side (the docs
// Schema-builder demo does exactly this), in a build script, or in your own
// tool. The pipeline is `zod schema -> fromZod -> FieldSpec IR -> emitters`;
// build a FieldSpec by hand or from fromZod, then run any emitter over it.
//
// The main entry (`formstand-cli`) re-exports all of this AND adds fromType
// (parse a TypeScript type/interface), which pulls the TypeScript compiler and
// is Node-oriented — import fromType from the main entry, not here.

export { fromZod, isZodSchema } from "./fromZod";

export {
  emitInitialValues,
  emitZodSchema,
  emitPlainForm,
  emitMuiForm,
  emitShadcnForm,
  emitTemplateForm,
  DEFAULT_VISUAL,
} from "./codegen";
export type { SchemaImport, EmitFormOptions, VisualOptions } from "./codegen";

export { emitModuleForm, joinModuleFiles } from "./moduleLayout";
export type { EmitModuleOptions, ModuleFile } from "./moduleLayout";

export { labelFromName } from "./ir";
export type {
  FieldSpec,
  NamedField,
  SharedSpecProps,
  UnionVariant,
} from "./ir";

// Naming helpers the emitters use — exported so a hand-built IR / custom
// tooling can mirror the CLI's identifier and label conventions.
export {
  camelCase,
  camelIdent,
  capitalize,
  isReservedWord,
  pascalCase,
  splitWords,
} from "./casing";

export { defineTemplate } from "./template";
export type {
  Template,
  TemplateLeafContext,
  TemplateLeafKind,
  TemplateImport,
} from "./template";
