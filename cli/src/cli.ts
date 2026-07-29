#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import { camelCase, isReservedWord, pascalCase } from "./casing";
import { type FormstandConfig, type Layout } from "./config";
import {
  type UiTarget,
  DEFAULT_MUI_VERSION,
  MUI_VERSIONS,
  UI_CHOICES,
  parseUiTarget,
} from "./uiTarget";
import { type Template, isTemplate } from "./template";
import {
  type EmitFormOptions,
  type VisualOptions,
  type SchemaImport,
  FORMSTAND_PATH_DEPTH,
  depthWarningFrontier,
  droppedDefaultFieldPaths,
  emitChakraForm,
  emitAntdForm,
  emitMantineForm,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
  emitTemplateForm,
  emitZodSchema,
  overBudgetFieldPaths,
  truncatedFieldPaths,
  unaddressableFieldPaths,
} from "./codegen";
import { fromType } from "./fromType";
import { DEFAULT_MAX_DEPTH, fromZod, isZodSchema } from "./fromZod";
import type { FieldSpec } from "./ir";
import {
  type EmitModuleOptions,
  type ModuleFile,
  emitModuleForm,
  joinModuleFiles,
} from "./moduleLayout";

// The --ui flag spelling and mui enumeration, derived from UI_CHOICES /
// MUI_VERSIONS (uiTarget.ts is the single source of truth) so HELP can't
// drift from what the parser accepts:
// "plain, mui, mui@<5|6|7|9>, ..." -> "plain|mui[@5|6|7|9]|...".
const UI_FLAG_CHOICES = UI_CHOICES.replace(
  /mui, mui@<([^>]+)>/,
  "mui[@$1]",
).replace(/, /g, "|");
const MUI_CHOICE_LIST = MUI_VERSIONS.map((version) => `mui@${version}`).join(
  ", ",
);

const HELP = `formstand-gen — generate formstand form components

Usage:
  formstand-gen <input.ts> [options]

Input:
  A TypeScript module exporting a zod schema (default), or any TypeScript
  file when --type names an exported type/interface (a zod schema source
  file is generated alongside the component in that mode).

Options:
  --export <name>     which export holds the zod schema (default: the default
                      export, or the sole zod-schema export)
  --type <TypeName>   generate from an exported TS type/interface instead
  --ui <${UI_FLAG_CHOICES}>
                      component flavor (default: plain). mui may pin an
                      @mui/material major: ${MUI_CHOICE_LIST}; bare
                      mui means mui@${DEFAULT_MUI_VERSION}. Only React-19-capable majors are
                      supported (formstand peers react ^19, so MUI 4 and
                      older can't install alongside it; MUI skipped 8).
                      chakra targets @chakra-ui/react 3 (the only supported
                      major; "chakra@3" spells the same thing) and assumes
                      the host app mounts ChakraProvider. mantine targets
                      @mantine/core 9, the current major ("mantine@9" spells
                      the same thing) and assumes the host app mounts
                      MantineProvider. antd targets antd 6, the current
                      major ("antd@6" spells the same thing); no provider is
                      required, and antd's own Form/Form.Item is never
                      emitted — formstand owns the form state.
  --layout <single|module>
                      single: one component file (default). module: a
                      feature-module folder (schema.ts/types.ts/hooks.ts via
                      createFormHooks, a shared adapter for the kit uis, one
                      file per field, one per section); --out names the
                      folder. Requires formstand >= 0.7.
  --sections <flat|panel|collapsible>
                      section chrome: flat headings (default), bordered
                      panels, or expandable sections
  --columns <1|2|3>   evenly spaced field columns inside each section
                      (default: 1); multi-row content spans the full row
  --max-depth <n>     schema/type nesting budget before a level degrades to a
                      string + TODO (default: derived from the FieldPath
                      budget, currently 11; also bounds nested-array row
                      extraction)
  --name <MyForm>     component name (default: derived from the schema/type)
  --out <file>        write the component here instead of stdout
  --schema-out <file> (type mode) where to write the generated zod schema
                      (default: <schemaName>.ts next to --out)
  --template <file>   custom template module (default-export defineTemplate)
                      for a UI kit formstand doesn't ship — overrides the
                      per-kind field rendering, inheriting the plain form
                      scaffold. --layout single only. Overrides --ui.
  --config <file>     config file (default: formstand.config.{ts,mts,js,mjs}
                      in the working directory). Holds project defaults for
                      ui/layout/sections/columns; explicit flags win.
  --watch             regenerate whenever the input file changes (requires
                      --out)
  --force             overwrite existing output files
  -h, --help          show this help

Examples:
  formstand-gen src/profileSchema.ts --out src/ProfileForm.tsx
  formstand-gen src/types.ts --type Profile --ui mui --out src/ProfileForm.tsx
  formstand-gen src/profileSchema.ts --ui shadcn --out src/ProfileForm.tsx
  formstand-gen src/profileSchema.ts --ui chakra --out src/ProfileForm.tsx
  formstand-gen src/profileSchema.ts --ui mantine --out src/ProfileForm.tsx
  formstand-gen src/profileSchema.ts --ui antd --out src/ProfileForm.tsx
  formstand-gen src/profileSchema.ts --layout module --out src/ProfileForm
  formstand-gen src/profileSchema.ts --ui mui --sections panel --columns 2
  formstand-gen src/profileSchema.ts --ui mui@5 --out src/ProfileForm.tsx
  formstand-gen src/profileSchema.ts --template ./mantine.template.ts --out src/ProfileForm.tsx
`;

const LAYOUT_VALUES: readonly Layout[] = ["single", "module"];

const isLayout = (value: string): value is Layout =>
  (LAYOUT_VALUES as readonly string[]).includes(value);

type Sections = VisualOptions["sections"];

const SECTIONS_VALUES: readonly Sections[] = ["flat", "panel", "collapsible"];

const isSections = (value: string): value is Sections =>
  (SECTIONS_VALUES as readonly string[]).includes(value);

type Columns = VisualOptions["columns"];

const COLUMNS_BY_TEXT: Readonly<Record<string, Columns>> = {
  "1": 1,
  "2": 2,
  "3": 3,
};

type CliOptions = Readonly<{
  input: string;
  exportName?: string;
  typeName?: string;
  ui: UiTarget;
  layout: Layout;
  sections: Sections;
  columns: Columns;
  name?: string;
  out?: string;
  schemaOut?: string;
  config?: string;
  template?: string;
  maxDepth?: number;
  watch: boolean;
  force: boolean;
}>;

// What the flag parser produces: the config-mergeable axes stay undefined
// until resolveOptions applies config values and then the defaults, so
// "--ui plain" (explicit) and "no --ui" (config decides) are distinct.
export type ParsedCliOptions = Readonly<{
  input: string;
  exportName?: string;
  typeName?: string;
  ui?: UiTarget;
  layout?: Layout;
  sections?: Sections;
  columns?: Columns;
  name?: string;
  out?: string;
  schemaOut?: string;
  config?: string;
  template?: string;
  maxDepth?: number;
  watch: boolean;
  force: boolean;
}>;

type ParseResult =
  | Readonly<{ kind: "help" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ok"; options: ParsedCliOptions }>;

type PartialOptions = Readonly<{
  input?: string;
  exportName?: string;
  typeName?: string;
  ui?: UiTarget;
  layout?: Layout;
  sections?: Sections;
  columns?: Columns;
  name?: string;
  out?: string;
  schemaOut?: string;
  config?: string;
  template?: string;
  maxDepth?: number;
  watch: boolean;
  force: boolean;
}>;

const VALUE_FLAGS: Readonly<
  Record<
    string,
    | "exportName"
    | "typeName"
    | "layout"
    | "name"
    | "out"
    | "schemaOut"
    | "config"
    | "template"
  >
> = {
  "--export": "exportName",
  "--type": "typeName",
  "--layout": "layout",
  "--name": "name",
  "--out": "out",
  "--schema-out": "schemaOut",
  "--config": "config",
  "--template": "template",
};

const parseRest = (
  args: readonly string[],
  acc: PartialOptions,
): ParseResult => {
  const [head, ...rest] = args;
  if (head === undefined) {
    return acc.input === undefined
      ? { kind: "error", message: "missing input file" }
      : { kind: "ok", options: { ...acc, input: acc.input } };
  }
  if (head === "--help" || head === "-h") return { kind: "help" };
  if (head === "--force") return parseRest(rest, { ...acc, force: true });
  if (head === "--watch") return parseRest(rest, { ...acc, watch: true });
  if (head === "--ui") {
    const [value, ...after] = rest;
    if (value === undefined) {
      return { kind: "error", message: `missing value for ${head}` };
    }
    // "--ui mui@5" parses to a structured target here, so everything past
    // the flag layer works with { kit, version } instead of strings.
    const parsed = parseUiTarget(value);
    if (parsed.kind === "error") {
      return { kind: "error", message: `--ui ${parsed.message}` };
    }
    return parseRest(after, { ...acc, ui: parsed.target });
  }
  if (head === "--sections") {
    const [value, ...after] = rest;
    if (value === undefined) {
      return { kind: "error", message: `missing value for ${head}` };
    }
    if (!isSections(value)) {
      return {
        kind: "error",
        message: `--sections must be one of ${SECTIONS_VALUES.map((s) => `"${s}"`).join(", ")}, got "${value}"`,
      };
    }
    return parseRest(after, { ...acc, sections: value });
  }
  if (head === "--columns") {
    const [value, ...after] = rest;
    if (value === undefined) {
      return { kind: "error", message: `missing value for ${head}` };
    }
    const columns = COLUMNS_BY_TEXT[value];
    if (columns === undefined) {
      return {
        kind: "error",
        message: `--columns must be 1, 2, or 3, got "${value}"`,
      };
    }
    return parseRest(after, { ...acc, columns });
  }
  if (head === "--max-depth") {
    const [value, ...after] = rest;
    if (value === undefined) {
      return { kind: "error", message: `missing value for ${head}` };
    }
    // A positive integer: the schema/type nesting budget the walkers spend
    // before a level degrades to a string + TODO (the recursion backstop).
    const maxDepth = /^[1-9][0-9]*$/.test(value) ? Number(value) : undefined;
    if (maxDepth === undefined) {
      return {
        kind: "error",
        message: `--max-depth must be a positive integer, got "${value}"`,
      };
    }
    return parseRest(after, { ...acc, maxDepth });
  }
  const key = VALUE_FLAGS[head];
  if (key !== undefined) {
    const [value, ...after] = rest;
    if (value === undefined) {
      return { kind: "error", message: `missing value for ${head}` };
    }
    if (head === "--layout" && !isLayout(value)) {
      return {
        kind: "error",
        message: `--layout must be one of ${LAYOUT_VALUES.map((layout) => `"${layout}"`).join(", ")}, got "${value}"`,
      };
    }
    // The name is interpolated verbatim as a declared identifier (and, for
    // --layout module, as file names and the index.ts export) — reject
    // anything that would emit unparseable code.
    if (
      head === "--name" &&
      (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) || isReservedWord(value))
    ) {
      return {
        kind: "error",
        message: `--name must be a valid identifier (PascalCase recommended, e.g. ProfileForm), got "${value}"`,
      };
    }
    return parseRest(after, { ...acc, [key]: value });
  }
  if (head.startsWith("-")) {
    return { kind: "error", message: `unknown flag ${head}` };
  }
  if (acc.input !== undefined) {
    return {
      kind: "error",
      message: `unexpected extra argument "${head}" (input already set to "${acc.input}")`,
    };
  }
  return parseRest(rest, { ...acc, input: head });
};

export const parseArgs = (argv: readonly string[]): ParseResult =>
  parseRest(argv, { watch: false, force: false });

const CONFIG_BASENAMES = [
  "formstand.config.ts",
  "formstand.config.mts",
  "formstand.config.js",
  "formstand.config.mjs",
];

// The config after validation: same shape as FormstandConfig, but with the
// ui spelling already parsed to a structured target (the same parser the
// --ui flag uses).
type LoadedConfig = Readonly<
  Omit<FormstandConfig, "ui"> & { ui?: UiTarget }
>;

// Validate an unknown config value against the same guards the flags use,
// so a typo'd config fails as loudly as a typo'd flag.
const parseConfig = (raw: unknown, from: string): LoadedConfig => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${from}: expected a default-exported config object`);
  }
  const record = raw as Readonly<Record<string, unknown>>;
  const known = new Set(["ui", "layout", "sections", "columns", "template"]);
  Object.keys(record)
    .filter((key) => !known.has(key))
    .forEach((key) => {
      stderr(`note: ${from}: ignoring unknown config key "${key}"`);
    });
  const { ui, layout, sections, columns, template } = record;
  const uiTarget =
    ui === undefined
      ? undefined
      : typeof ui === "string"
        ? parseUiTarget(ui)
        : ({ kind: "error", message: `must be one of ${UI_CHOICES}` } as const);
  if (uiTarget !== undefined && uiTarget.kind === "error") {
    throw new Error(`${from}: ui ${uiTarget.message}`);
  }
  if (
    layout !== undefined &&
    (typeof layout !== "string" || !isLayout(layout))
  ) {
    throw new Error(
      `${from}: layout must be one of ${LAYOUT_VALUES.join(", ")}`,
    );
  }
  if (
    sections !== undefined &&
    (typeof sections !== "string" || !isSections(sections))
  ) {
    throw new Error(
      `${from}: sections must be one of ${SECTIONS_VALUES.join(", ")}`,
    );
  }
  const columnsValue =
    columns === undefined ? undefined : COLUMNS_BY_TEXT[String(columns)];
  if (columns !== undefined && columnsValue === undefined) {
    throw new Error(`${from}: columns must be 1, 2, or 3`);
  }
  if (template !== undefined && typeof template !== "string") {
    throw new Error(`${from}: template must be a path string`);
  }
  return {
    ...(uiTarget !== undefined ? { ui: uiTarget.target } : {}),
    ...(layout !== undefined ? { layout: layout as Layout } : {}),
    ...(sections !== undefined ? { sections: sections as Sections } : {}),
    ...(columnsValue !== undefined ? { columns: columnsValue } : {}),
    // Config-relative so `template: "./x.ts"` resolves next to the config,
    // not the cwd. An explicit --template (already cwd-absolute) wins in
    // resolveOptions.
    ...(typeof template === "string"
      ? { template: path.resolve(path.dirname(from), template) }
      : {}),
  };
};

const loadConfig = async (explicit?: string): Promise<LoadedConfig> => {
  const file =
    explicit !== undefined
      ? path.resolve(explicit)
      : CONFIG_BASENAMES.map((name) => path.resolve(name)).find((candidate) =>
          fs.existsSync(candidate),
        );
  if (file === undefined) return {};
  if (explicit !== undefined && !fs.existsSync(file)) {
    throw new Error(`config file not found: ${explicit}`);
  }
  const mod = await loadModule(file, relToCwd(file));
  // jiti's ESM interop may flatten the default export; accept either shape.
  const candidate = mod["default"] ?? mod;
  return parseConfig(candidate, relToCwd(file));
};

// Flags win over config; config wins over built-in defaults.
// Load and validate a custom template module (same jiti path as schemas).
const loadTemplate = async (file: string): Promise<Template> => {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new Error(`template file not found: ${file}`);
  }
  const mod = await loadModule(abs, relToCwd(abs));
  const candidate = mod["default"] ?? mod;
  if (!isTemplate(candidate)) {
    throw new Error(
      `${relToCwd(abs)}: not a valid template — default-export defineTemplate({ name, leaf })`,
    );
  }
  return candidate;
};

export const resolveOptions = (
  parsed: ParsedCliOptions,
  config: LoadedConfig,
): CliOptions => ({
  ...parsed,
  ui: parsed.ui ?? config.ui ?? { kit: "plain" },
  layout: parsed.layout ?? config.layout ?? "single",
  sections: parsed.sections ?? config.sections ?? "flat",
  columns: parsed.columns ?? config.columns ?? 1,
  ...(parsed.template ?? config.template
    ? { template: parsed.template ?? config.template }
    : {}),
});

const visualOf = (options: CliOptions): VisualOptions => ({
  sections: options.sections,
  columns: options.columns,
});

// "profileSchema" → "ProfileForm"; "Profile" → "ProfileForm".
const deriveFormName = (base: string): string => {
  const pascal = pascalCase(base.replace(/schema$/i, ""));
  return `${pascal.length === 0 ? "Generated" : pascal}Form`;
};

// Relative import specifier from one directory to a target module file.
export const moduleSpecifier = (fromDir: string, targetAbs: string): string => {
  const relative = path.relative(fromDir, targetAbs);
  // On Windows, path.relative across drives returns the target ABSOLUTE —
  // "./D:/schemas/x" would be an unresolvable specifier, so fail loudly at
  // generation time instead (main() reports thrown errors and exits 1).
  if (path.isAbsolute(relative)) {
    throw new Error(
      `cannot build a relative import from ${fromDir} to ${targetAbs} (different drives?); keep the input and --out on the same drive`,
    );
  }
  const specifier = relative
    .replace(/\\/g, "/")
    .replace(/\.(tsx|ts|mts|cts|jsx|js)$/, "");
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
};

const relToCwd = (fileAbs: string): string => {
  const relative = path.relative(process.cwd(), fileAbs);
  return relative.length === 0 ? fileAbs : relative;
};

// Pre-flight overwrite check for every destination of a command, run before
// the first write so a refusal can never leave a half-written pair behind.
const assertWritable = (paths: readonly string[], force: boolean): void => {
  const existing = force ? [] : paths.filter((p) => fs.existsSync(p));
  const first = existing[0];
  if (first !== undefined) {
    throw new Error(`refusing to overwrite ${relToCwd(first)} (pass --force)`);
  }
};

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
};

// Module layout: write the whole folder (all destinations pre-checked so a
// refusal can never leave a half-written module), or stream it to stdout
// with the multi-file headers when no --out is given.
const emitModuleOutput = (
  files: readonly ModuleFile[],
  out: string | undefined,
  force: boolean,
): void => {
  if (out === undefined) {
    stdout(joinModuleFiles(files));
    return;
  }
  const outDir = path.resolve(out);
  const destinations = files.map((file) => path.join(outDir, file.path));
  assertWritable(destinations, force);
  files.forEach((file, i) => {
    const dest = destinations[i];
    if (dest !== undefined) {
      writeFile(dest, file.content);
      stderr(`wrote ${relToCwd(dest)}`);
    }
  });
};

type SchemaPick =
  | Readonly<{
      kind: "found";
      exportName: string;
      importKind: "named" | "default";
      schema: unknown;
    }>
  | Readonly<{ kind: "not-found"; message: string }>;

const availableExports = (mod: Readonly<Record<string, unknown>>): string => {
  const names = Object.keys(mod).join(", ");
  return names.length === 0 ? "none" : names;
};

// jiti's ESM interop can flatten a default export onto the namespace object
// itself (mod.safeParse works, while mod["default"] is an exotic binding) —
// accept either shape.
const defaultExport = (
  mod: Readonly<Record<string, unknown>>,
): unknown =>
  isZodSchema(mod["default"])
    ? mod["default"]
    : isZodSchema(mod)
      ? mod
      : undefined;

const pickSchemaExport = (
  mod: Readonly<Record<string, unknown>>,
  exportName: string | undefined,
  input: string,
  fallbackName: string,
): SchemaPick => {
  if (exportName !== undefined) {
    const value =
      exportName === "default" ? defaultExport(mod) : mod[exportName];
    if (value === undefined) {
      return {
        kind: "not-found",
        message: `no export named "${exportName}" in ${input} (available: ${availableExports(mod)})`,
      };
    }
    if (!isZodSchema(value)) {
      return {
        kind: "not-found",
        message: `export "${exportName}" in ${input} is not a zod schema (for a TS type, use --type ${exportName})`,
      };
    }
    // "default" is not a legal local identifier: import it as a default
    // import under the module-derived fallback name.
    return exportName === "default"
      ? {
          kind: "found",
          exportName: fallbackName,
          importKind: "default",
          schema: value,
        }
      : { kind: "found", exportName, importKind: "named", schema: value };
  }
  const dflt = defaultExport(mod);
  if (dflt !== undefined) {
    return {
      kind: "found",
      exportName: fallbackName,
      importKind: "default",
      schema: dflt,
    };
  }
  const zodExports = Object.entries(mod).filter(
    ([name, value]) => name !== "default" && isZodSchema(value),
  );
  const sole = zodExports[0];
  if (zodExports.length === 1 && sole !== undefined) {
    return {
      kind: "found",
      exportName: sole[0],
      importKind: "named",
      schema: sole[1],
    };
  }
  if (zodExports.length === 0) {
    return {
      kind: "not-found",
      message: `no zod schema exports found in ${input} (available exports: ${availableExports(mod)}; for a TS type/interface, pass --type TypeName)`,
    };
  }
  return {
    kind: "not-found",
    message: `multiple zod schema exports in ${input} (${zodExports
      .map(([name]) => name)
      .join(", ")}); pick one with --export`,
  };
};

const emitComponent = (
  ui: UiTarget,
  options: EmitFormOptions,
  template?: Template,
): string => {
  if (template !== undefined) return emitTemplateForm(template, options);
  switch (ui.kit) {
    case "mui":
      return emitMuiForm({ ...options, muiVersion: ui.version });
    case "shadcn":
      return emitShadcnForm(options);
    case "chakra":
      return emitChakraForm(options);
    case "mantine":
      return emitMantineForm(options);
    case "antd":
      return emitAntdForm(options);
    case "plain":
      return emitPlainForm(options);
  }
};

// EmitModuleOptions speaks kit + optional muiVersion; flatten the parsed
// target into that shape for the module-layout call sites.
const moduleUiOf = (
  ui: UiTarget,
): Readonly<Pick<EmitModuleOptions, "ui" | "muiVersion">> =>
  ui.kit === "mui" ? { ui: "mui", muiVersion: ui.version } : { ui: ui.kit };

const stdout = (text: string): void => {
  process.stdout.write(text);
};

const stderr = (text: string): void => {
  process.stderr.write(`${text}\n`);
};

const firstLine = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "";

const loadModule = async (
  inputAbs: string,
  inputAsTyped: string,
): Promise<Readonly<Record<string, unknown>>> => {
  const jiti = createJiti(import.meta.url);
  try {
    return (await jiti.import(pathToFileURL(inputAbs).href)) as Readonly<
      Record<string, unknown>
    >;
  } catch (e) {
    throw new Error(`could not load ${inputAsTyped}: ${firstLine(e)}`);
  }
};

const warnDegradedBindings = (
  ir: FieldSpec,
  layout: Layout,
  walkerBudget: number,
): void => {
  unaddressableFieldPaths(ir).forEach((fieldPath) => {
    stderr(
      `warning: field "${fieldPath}" skipped — "." in a key is not path-addressable (see formstand docs)`,
    );
  });
  // Bindings past the library's typed-path budget degrade to in-file TODOs;
  // mirror each one on stderr so the degradation is visible at generation
  // time ("*" marks an array row index). The two layouts stop descending at
  // different frontiers, so the walk is told which one is emitting.
  overBudgetFieldPaths(ir, depthWarningFrontier(layout)).forEach((fieldPath) => {
    stderr(
      `warning: path "${fieldPath}" exceeds formstand's typed FieldPath depth (${FORMSTAND_PATH_DEPTH}); emitted a TODO — bind it by hand`,
    );
  });
  // Leaves the WALKER truncated (past the nesting budget) degrade to
  // string-kind placeholders whose kind may be wrong — the initialValues
  // cast keeps the file compiling, but the field needs hand attention.
  truncatedFieldPaths(ir).forEach((fieldPath) => {
    stderr(
      `warning: path "${fieldPath}" exceeds the walker nesting budget (${walkerBudget}); field degraded to a placeholder — raise --max-depth or bind by hand`,
    );
  });
  // Defaults the capture guard or the emitter refused start blank despite
  // the schema's .default() — never silently.
  droppedDefaultFieldPaths(ir).forEach((fieldPath) => {
    stderr(
      `warning: field "${fieldPath}" has a .default() the CLI could not capture (non-primitive, non-deterministic, or degraded field); it starts blank — seed it by hand`,
    );
  });
};

const runZodMode = async (
  options: CliOptions,
  template?: Template,
): Promise<number> => {
  const inputAbs = path.resolve(options.input);
  const mod = await loadModule(inputAbs, options.input);
  const fallbackName = camelCase(path.basename(inputAbs).replace(/\..*$/, ""));
  const pick = pickSchemaExport(
    mod,
    options.exportName,
    options.input,
    fallbackName.length === 0 ? "schema" : fallbackName,
  );
  if (pick.kind === "not-found") {
    stderr(`error: ${pick.message}`);
    return 1;
  }
  const ir: FieldSpec = fromZod(pick.schema, options.maxDepth);
  warnDegradedBindings(ir, options.layout, options.maxDepth ?? DEFAULT_MAX_DEPTH);
  const formName = options.name ?? deriveFormName(pick.exportName);
  const fromDir =
    options.out !== undefined
      ? options.layout === "module"
        ? path.resolve(options.out)
        : path.dirname(path.resolve(options.out))
      : process.cwd();
  const schemaImport: SchemaImport = {
    name: pick.exportName,
    from: moduleSpecifier(fromDir, inputAbs),
    kind: pick.importKind,
  };
  if (options.schemaOut !== undefined) {
    stderr("note: --schema-out is ignored in zod mode (the schema already exists)");
  }
  if (options.layout === "module") {
    emitModuleOutput(
      emitModuleForm({
        ir,
        formName,
        schemaImport,
        ...moduleUiOf(options.ui),
        visual: visualOf(options),
      }),
      options.out,
      options.force,
    );
    return 0;
  }
  const code = emitComponent(
    options.ui,
    { ir, formName, schemaImport, visual: visualOf(options) },
    template,
  );
  if (options.out !== undefined) {
    const outAbs = path.resolve(options.out);
    assertWritable([outAbs], options.force);
    writeFile(outAbs, code);
    stderr(`wrote ${relToCwd(outAbs)}`);
    return 0;
  }
  stdout(code);
  return 0;
};

const runTypeMode = (options: CliOptions, template?: Template): number => {
  // Pass the input as the user typed it so error messages echo it verbatim
  // (fromType resolves it internally).
  const { ir, typeName } = fromType(
    options.input,
    options.typeName,
    options.maxDepth,
  );
  warnDegradedBindings(ir, options.layout, options.maxDepth ?? DEFAULT_MAX_DEPTH);
  const schemaName = `${camelCase(typeName)}Schema`;
  const formName = options.name ?? deriveFormName(typeName);
  const schemaSource = emitZodSchema(ir, schemaName);
  if (options.layout === "module") {
    // The schema is a module file (schema.ts), so --schema-out has no
    // separate destination here.
    if (options.schemaOut !== undefined) {
      stderr(
        "note: --schema-out is ignored with --layout module (the schema is the module's schema.ts)",
      );
    }
    emitModuleOutput(
      emitModuleForm({
        ir,
        formName,
        schemaImport: { name: schemaName, from: "./schema", kind: "named" },
        schemaSource,
        ...moduleUiOf(options.ui),
        visual: visualOf(options),
      }),
      options.out,
      options.force,
    );
    return 0;
  }
  if (options.out !== undefined) {
    const outAbs = path.resolve(options.out);
    const schemaOutAbs =
      options.schemaOut !== undefined
        ? path.resolve(options.schemaOut)
        : path.join(path.dirname(outAbs), `${schemaName}.ts`);
    const schemaImport: SchemaImport = {
      name: schemaName,
      from: moduleSpecifier(path.dirname(outAbs), schemaOutAbs),
      kind: "named",
    };
    const code = emitComponent(
      options.ui,
      { ir, formName, schemaImport, visual: visualOf(options) },
      template,
    );
    // Check BOTH destinations before writing either.
    assertWritable([schemaOutAbs, outAbs], options.force);
    writeFile(schemaOutAbs, schemaSource);
    writeFile(outAbs, code);
    stderr(`wrote ${relToCwd(schemaOutAbs)}`);
    stderr(`wrote ${relToCwd(outAbs)}`);
    return 0;
  }
  if (options.schemaOut !== undefined) {
    // Component to stdout, but the schema still gets its requested file.
    const schemaOutAbs = path.resolve(options.schemaOut);
    const schemaImport: SchemaImport = {
      name: schemaName,
      from: moduleSpecifier(process.cwd(), schemaOutAbs),
      kind: "named",
    };
    const code = emitComponent(
      options.ui,
      { ir, formName, schemaImport, visual: visualOf(options) },
      template,
    );
    assertWritable([schemaOutAbs], options.force);
    writeFile(schemaOutAbs, schemaSource);
    stderr(`wrote ${relToCwd(schemaOutAbs)}`);
    stdout(code);
    return 0;
  }
  const schemaImport: SchemaImport = {
    name: schemaName,
    from: `./${schemaName}`,
    kind: "named",
  };
  const code = emitComponent(
    options.ui,
    { ir, formName, schemaImport, visual: visualOf(options) },
    template,
  );
  stdout(
    [
      `// --- file: ${schemaName}.ts`,
      schemaSource,
      `// --- file: ${formName}.tsx`,
      code,
    ].join("\n"),
  );
  return 0;
};

// Regenerate on input change. The first run respects --force; reruns
// overwrite the destinations they themselves wrote. Watching the parent
// directory (filtered to the input's basename) survives editors that save
// via rename, which would kill a watcher on the file itself.
const runWatch = async (
  options: CliOptions,
  template?: Template,
): Promise<number> => {
  if (options.out === undefined) {
    stderr("error: --watch requires --out (regenerating to stdout repeats forever)");
    return 1;
  }
  const first = await run(options, template);
  if (first !== 0) return first;
  const inputAbs = path.resolve(options.input);
  stderr(`watching ${relToCwd(inputAbs)} (ctrl+c to stop)`);
  // A sanctioned mutable ref (like the pass tokens): debounce state for the
  // watcher callback.
  const pending: { timer: NodeJS.Timeout | undefined } = { timer: undefined };
  return new Promise<number>(() => {
    fs.watch(path.dirname(inputAbs), (_event, filename) => {
      if (filename !== null && filename !== path.basename(inputAbs)) return;
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.timer = setTimeout(() => {
        void run({ ...options, force: true }, template).then((code) => {
          stderr(
            code === 0
              ? `regenerated (${new Date().toLocaleTimeString()})`
              : "regeneration failed; still watching",
          );
        });
      }, 80);
    });
  });
};

const run = async (
  options: CliOptions,
  template?: Template,
): Promise<number> => {
  if (!fs.existsSync(path.resolve(options.input))) {
    stderr(`error: input file not found: ${options.input}`);
    return 1;
  }
  return options.typeName !== undefined
    ? runTypeMode(options, template)
    : runZodMode(options, template);
};

export const main = async (argv: readonly string[]): Promise<number> => {
  const parsed = parseArgs(argv);
  switch (parsed.kind) {
    case "help":
      stdout(HELP);
      return 0;
    case "error":
      stderr(`error: ${parsed.message}`);
      stderr("run formstand-gen --help for usage");
      return 1;
    case "ok":
      try {
        const config = await loadConfig(parsed.options.config);
        const options = resolveOptions(parsed.options, config);
        if (options.template !== undefined && options.layout === "module") {
          stderr(
            "error: custom templates support --layout single only (module support is planned)",
          );
          return 1;
        }
        const template =
          options.template !== undefined
            ? await loadTemplate(options.template)
            : undefined;
        return options.watch
          ? await runWatch(options, template)
          : await run(options, template);
      } catch (e) {
        stderr(`error: ${e instanceof Error ? e.message : String(e)}`);
        return 1;
      }
  }
};

// npm installs bin entries as symlinks in node_modules/.bin. When Node loads
// an ESM entry through such a symlink, import.meta.url is derived from the
// *resolved* (real) file path, while process.argv[1] keeps the symlink path —
// so a raw comparison never matches and the CLI silently does nothing.
// Realpath argv[1] before comparing; if realpath fails (the path vanished, or
// permissions), fall back to the raw resolved path.
export const isInvokedAsScript = (
  argv1: string | undefined,
  moduleUrl: string,
): boolean => {
  if (argv1 === undefined) return false;
  const resolved = ((): string => {
    try {
      return fs.realpathSync(path.resolve(argv1));
    } catch {
      return path.resolve(argv1);
    }
  })();
  return pathToFileURL(resolved).href.toLowerCase() === moduleUrl.toLowerCase();
};

if (isInvokedAsScript(process.argv[1], import.meta.url)) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
