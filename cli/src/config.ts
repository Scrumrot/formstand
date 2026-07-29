import type { VisualOptions } from "./codegen";
import type { Ui } from "./uiTarget";

// The project-level defaults formstand-gen reads from formstand.config.ts
// (or .mts/.js/.mjs) in the working directory — everything here is a
// DEFAULT: explicit flags always win. Per-invocation things (input, --out,
// --name) stay flags on purpose; the config holds the choices that are
// stable per project.
export type { Ui } from "./uiTarget";
export type Layout = "single" | "module";

export type FormstandConfig = Readonly<{
  // Same spellings as --ui: "plain", "shadcn", "mui" (current major), a
  // pinned "mui@5" | "mui@6" | "mui@7" | "mui@9", "chakra" (v3 — the only
  // supported major, also spelled "chakra@3"), "mantine" (v9 — the current
  // major, also spelled "mantine@9"), or "antd" (v6 — the current major,
  // also spelled "antd@6").
  ui?: Ui;
  layout?: Layout;
  sections?: VisualOptions["sections"];
  columns?: VisualOptions["columns"];
  // Path to a custom template module (see defineTemplate), resolved relative
  // to the config file. A --template flag overrides it.
  template?: string;
}>;

// Identity with types — `export default defineConfig({ ui: "mui" })` gets
// completion and typo-checking in the config file.
export const defineConfig = (config: FormstandConfig): FormstandConfig =>
  config;
