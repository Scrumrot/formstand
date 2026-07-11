// Programmatic API for formstand-cli (the main entry).
//
// This re-exports the entire browser-safe codegen surface (see ./codegen-api,
// also published as the `formstand-cli/codegen` subpath) and ADDS the parts
// that need Node / the TypeScript compiler: fromType (parse a TS
// type/interface) and defineConfig (the config file's typed identity). Import
// from `formstand-cli/codegen` for a browser-safe build with no
// TypeScript-compiler dependency.

export * from "./codegen-api";

export { fromType } from "./fromType";
export type { FromTypeResult } from "./fromType";

export { defineConfig } from "./config";
export type { FormstandConfig } from "./config";
