import type { VisualOptions } from "./codegen";
import type { FieldOverrides } from "./overrides";
import type { Ui } from "./uiTarget";

// The project-level defaults formstand-gen reads from formstand.config.ts
// (or .mts/.js/.mjs) in the working directory — everything here is a
// DEFAULT: explicit flags always win. Per-invocation things (input, --out,
// --name) stay flags on purpose; the config holds the choices that are
// stable per project.
export type { Ui } from "./uiTarget";
export type Layout = "single" | "module";

// The generated-tests block (design: cli/design/generated-tests.md).
// `runners` is the --tests default; the rest has no flag spelling — a
// render wrapper and a browser base URL are project facts, not
// per-invocation choices.
export type TestsConfig = Readonly<{
  runners?: readonly ("vitest" | "jest" | "playwright")[];
  // Import specifier for the app's render wrapper (a module exporting
  // `RenderWrapper`), as resolvable FROM THE GENERATED SPEC's location.
  // Kit output without one emits its render cases as it.skip, loudly.
  renderWrapper?: string;
  // Playwright specs are emitted only when a baseURL exists — a browser
  // spec that guesses its URL is a broken spec with extra steps.
  playwright?: Readonly<{ baseURL?: string; route?: string }>;
}>;

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
  // --live default: generate live/no-submit forms (no submit scaffold, an
  // optional onValuesChange prop, emitted mode "onChange").
  live?: boolean;
  // --form-prop default: the component takes a typed `form` prop and the
  // useForm scaffold is emitted as an exported hook.
  formProp?: boolean;
  // Path to a custom template module (see defineTemplate), resolved relative
  // to the config file. A --template flag overrides it.
  template?: string;
  // Per-field component overrides, keyed by exact dot path against the
  // walked schema ("*" matches one array-index segment):
  //   fields: {
  //     "icao": { component: "autocomplete", optionsProp: true },
  //     "crew.*.role": { component: "autocomplete", optionsProp: true },
  //   }
  // "autocomplete" (free text with suggestions) is the only flavor today;
  // string fields REQUIRE optionsProp: true (the generated component then
  // takes e.g. `crewRoleOptions: readonly string[]`), enum fields default
  // to their baked-in values (optionsProp: true replaces them with the
  // prop). A path matching nothing, a non-string/enum target, or a string
  // without optionsProp is a loud generation-time ERROR.
  fields?: FieldOverrides;
  // Generated tests beside the component (see TestsConfig above).
  tests?: TestsConfig;
}>;

// Identity with types — `export default defineConfig({ ui: "mui" })` gets
// completion and typo-checking in the config file.
export const defineConfig = (config: FormstandConfig): FormstandConfig =>
  config;
