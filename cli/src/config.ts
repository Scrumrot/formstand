import type { VisualOptions } from "./codegen";

// The project-level defaults formstand-gen reads from formstand.config.ts
// (or .mts/.js/.mjs) in the working directory — everything here is a
// DEFAULT: explicit flags always win. Per-invocation things (input, --out,
// --name) stay flags on purpose; the config holds the choices that are
// stable per project.
export type Ui = "plain" | "mui" | "shadcn";
export type Layout = "single" | "module";

export type FormstandConfig = Readonly<{
  ui?: Ui;
  layout?: Layout;
  sections?: VisualOptions["sections"];
  columns?: VisualOptions["columns"];
}>;

// Identity with types — `export default defineConfig({ ui: "mui" })` gets
// completion and typo-checking in the config file.
export const defineConfig = (config: FormstandConfig): FormstandConfig =>
  config;
