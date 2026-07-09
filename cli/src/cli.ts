#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import { camelCase, pascalCase } from "./casing";
import {
  type EmitFormOptions,
  type SchemaImport,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
  emitZodSchema,
  unaddressableFieldPaths,
} from "./codegen";
import { fromType } from "./fromType";
import { fromZod, isZodSchema } from "./fromZod";
import type { FieldSpec } from "./ir";
import {
  type ModuleFile,
  emitModuleForm,
  joinModuleFiles,
} from "./moduleLayout";

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
  --ui <plain|mui|shadcn>
                      component flavor (default: plain)
  --layout <single|module>
                      single: one component file (default). module: a
                      feature-module folder (schema.ts/types.ts/hooks.ts via
                      createFormHooks, a shared adapter for the kit uis, one
                      file per field, one per section); --out names the
                      folder. Requires formstand >= 0.7.
  --name <MyForm>     component name (default: derived from the schema/type)
  --out <file>        write the component here instead of stdout
  --schema-out <file> (type mode) where to write the generated zod schema
                      (default: <schemaName>.ts next to --out)
  --force             overwrite existing output files
  -h, --help          show this help

Examples:
  formstand-gen src/profileSchema.ts --out src/ProfileForm.tsx
  formstand-gen src/types.ts --type Profile --ui mui --out src/ProfileForm.tsx
  formstand-gen src/profileSchema.ts --ui shadcn --out src/ProfileForm.tsx
  formstand-gen src/profileSchema.ts --layout module --out src/ProfileForm
`;

type Ui = "plain" | "mui" | "shadcn";

const UI_VALUES: readonly Ui[] = ["plain", "mui", "shadcn"];

const isUi = (value: string): value is Ui =>
  (UI_VALUES as readonly string[]).includes(value);

type Layout = "single" | "module";

const LAYOUT_VALUES: readonly Layout[] = ["single", "module"];

const isLayout = (value: string): value is Layout =>
  (LAYOUT_VALUES as readonly string[]).includes(value);

type CliOptions = Readonly<{
  input: string;
  exportName?: string;
  typeName?: string;
  ui: Ui;
  layout: Layout;
  name?: string;
  out?: string;
  schemaOut?: string;
  force: boolean;
}>;

type ParseResult =
  | Readonly<{ kind: "help" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ok"; options: CliOptions }>;

type PartialOptions = Readonly<{
  input?: string;
  exportName?: string;
  typeName?: string;
  ui: Ui;
  layout: Layout;
  name?: string;
  out?: string;
  schemaOut?: string;
  force: boolean;
}>;

const VALUE_FLAGS: Readonly<
  Record<
    string,
    "exportName" | "typeName" | "ui" | "layout" | "name" | "out" | "schemaOut"
  >
> = {
  "--export": "exportName",
  "--type": "typeName",
  "--ui": "ui",
  "--layout": "layout",
  "--name": "name",
  "--out": "out",
  "--schema-out": "schemaOut",
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
  const key = VALUE_FLAGS[head];
  if (key !== undefined) {
    const [value, ...after] = rest;
    if (value === undefined) {
      return { kind: "error", message: `missing value for ${head}` };
    }
    if (head === "--ui" && !isUi(value)) {
      return {
        kind: "error",
        message: `--ui must be one of ${UI_VALUES.map((ui) => `"${ui}"`).join(", ")}, got "${value}"`,
      };
    }
    if (head === "--layout" && !isLayout(value)) {
      return {
        kind: "error",
        message: `--layout must be one of ${LAYOUT_VALUES.map((layout) => `"${layout}"`).join(", ")}, got "${value}"`,
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
  parseRest(argv, { ui: "plain", layout: "single", force: false });

// "profileSchema" → "ProfileForm"; "Profile" → "ProfileForm".
const deriveFormName = (base: string): string => {
  const pascal = pascalCase(base.replace(/schema$/i, ""));
  return `${pascal.length === 0 ? "Generated" : pascal}Form`;
};

// Relative import specifier from one directory to a target module file.
export const moduleSpecifier = (fromDir: string, targetAbs: string): string => {
  const relative = path
    .relative(fromDir, targetAbs)
    .replace(/\\/g, "/")
    .replace(/\.(tsx|ts|mts|cts|jsx|js)$/, "");
  return relative.startsWith(".") ? relative : `./${relative}`;
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

const emitComponent = (ui: Ui, options: EmitFormOptions): string => {
  switch (ui) {
    case "mui":
      return emitMuiForm(options);
    case "shadcn":
      return emitShadcnForm(options);
    case "plain":
      return emitPlainForm(options);
  }
};

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

const warnUnaddressable = (ir: FieldSpec): void => {
  unaddressableFieldPaths(ir).forEach((fieldPath) => {
    stderr(
      `warning: field "${fieldPath}" skipped — "." in a key is not path-addressable (see formstand docs)`,
    );
  });
};

const runZodMode = async (options: CliOptions): Promise<number> => {
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
  const ir: FieldSpec = fromZod(pick.schema);
  warnUnaddressable(ir);
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
      emitModuleForm({ ir, formName, schemaImport, ui: options.ui }),
      options.out,
      options.force,
    );
    return 0;
  }
  const code = emitComponent(options.ui, { ir, formName, schemaImport });
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

const runTypeMode = (options: CliOptions): number => {
  // Pass the input as the user typed it so error messages echo it verbatim
  // (fromType resolves it internally).
  const { ir, typeName } = fromType(options.input, options.typeName);
  warnUnaddressable(ir);
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
        ui: options.ui,
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
    const code = emitComponent(options.ui, { ir, formName, schemaImport });
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
    const code = emitComponent(options.ui, { ir, formName, schemaImport });
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
  const code = emitComponent(options.ui, { ir, formName, schemaImport });
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

const run = async (options: CliOptions): Promise<number> => {
  if (!fs.existsSync(path.resolve(options.input))) {
    stderr(`error: input file not found: ${options.input}`);
    return 1;
  }
  return options.typeName !== undefined
    ? runTypeMode(options)
    : runZodMode(options);
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
        return await run(parsed.options);
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
