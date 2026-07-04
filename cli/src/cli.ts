#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import {
  type EmitFormOptions,
  type SchemaImport,
  emitMuiForm,
  emitPlainForm,
  emitZodSchema,
} from "./codegen";
import { fromType } from "./fromType";
import { fromZod, isZodSchema } from "./fromZod";
import type { FieldSpec } from "./ir";

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
  --ui <plain|mui>    component flavor (default: plain)
  --name <MyForm>     component name (default: derived from the schema/type)
  --out <file>        write the component here instead of stdout
  --schema-out <file> (type mode) where to write the generated zod schema
                      (default: <schemaName>.ts next to --out)
  --force             overwrite existing output files
  -h, --help          show this help

Examples:
  formstand-gen src/profileSchema.ts --out src/ProfileForm.tsx
  formstand-gen src/types.ts --type Profile --ui mui --out src/ProfileForm.tsx
`;

type CliOptions = Readonly<{
  input: string;
  exportName?: string;
  typeName?: string;
  ui: "plain" | "mui";
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
  ui: "plain" | "mui";
  name?: string;
  out?: string;
  schemaOut?: string;
  force: boolean;
}>;

const VALUE_FLAGS: Readonly<
  Record<string, "exportName" | "typeName" | "ui" | "name" | "out" | "schemaOut">
> = {
  "--export": "exportName",
  "--type": "typeName",
  "--ui": "ui",
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
    if (head === "--ui" && value !== "plain" && value !== "mui") {
      return {
        kind: "error",
        message: `--ui must be "plain" or "mui", got "${value}"`,
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
  parseRest(argv, { ui: "plain", force: false });

const capitalize = (word: string): string =>
  word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);

const pascalCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map(capitalize)
    .join("");

const camelCase = (name: string): string => {
  const pascal = pascalCase(name);
  return pascal.length === 0
    ? pascal
    : pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

// "profileSchema" → "ProfileForm"; "Profile" → "ProfileForm".
const deriveFormName = (base: string): string => {
  const pascal = pascalCase(base.replace(/schema$/i, ""));
  return `${pascal.length === 0 ? "Generated" : pascal}Form`;
};

// Relative import specifier from one directory to a target module file.
const moduleSpecifier = (fromDir: string, targetAbs: string): string => {
  const relative = path
    .relative(fromDir, targetAbs)
    .replace(/\\/g, "/")
    .replace(/\.(tsx|ts|mts|cts|jsx|js)$/, "");
  return relative.startsWith(".") ? relative : `./${relative}`;
};

const writeFileChecked = (
  filePath: string,
  content: string,
  force: boolean,
): void => {
  if (!force && fs.existsSync(filePath)) {
    throw new Error(`refusing to overwrite ${filePath} (pass --force)`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
};

type SchemaPick =
  | Readonly<{
      kind: "found";
      exportName: string;
      importKind: "named" | "default";
      schema: unknown;
    }>
  | Readonly<{ kind: "not-found"; message: string }>;

const pickSchemaExport = (
  mod: Readonly<Record<string, unknown>>,
  exportName: string | undefined,
  input: string,
  fallbackName: string,
): SchemaPick => {
  if (exportName !== undefined) {
    const value = mod[exportName];
    if (value === undefined) {
      return {
        kind: "not-found",
        message: `no export named "${exportName}" in ${input}`,
      };
    }
    return isZodSchema(value)
      ? { kind: "found", exportName, importKind: "named", schema: value }
      : {
          kind: "not-found",
          message: `export "${exportName}" in ${input} is not a zod schema (for a TS type, use --type ${exportName})`,
        };
  }
  if (isZodSchema(mod["default"])) {
    return {
      kind: "found",
      exportName: fallbackName,
      importKind: "default",
      schema: mod["default"],
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
      message: `no zod schema exports found in ${input} (for a TS type/interface, pass --type TypeName)`,
    };
  }
  return {
    kind: "not-found",
    message: `multiple zod schema exports in ${input} (${zodExports
      .map(([name]) => name)
      .join(", ")}); pick one with --export`,
  };
};

const emitComponent = (ui: "plain" | "mui", options: EmitFormOptions): string =>
  ui === "mui" ? emitMuiForm(options) : emitPlainForm(options);

const stdout = (text: string): void => {
  process.stdout.write(text);
};

const stderr = (text: string): void => {
  process.stderr.write(`${text}\n`);
};

const runZodMode = async (options: CliOptions): Promise<number> => {
  const inputAbs = path.resolve(options.input);
  const jiti = createJiti(import.meta.url);
  const mod = (await jiti.import(pathToFileURL(inputAbs).href)) as Readonly<
    Record<string, unknown>
  >;
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
  const formName = options.name ?? deriveFormName(pick.exportName);
  const fromDir =
    options.out !== undefined
      ? path.dirname(path.resolve(options.out))
      : process.cwd();
  const schemaImport: SchemaImport = {
    name: pick.exportName,
    from: moduleSpecifier(fromDir, inputAbs),
    kind: pick.importKind,
  };
  const code = emitComponent(options.ui, { ir, formName, schemaImport });
  if (options.schemaOut !== undefined) {
    stderr("note: --schema-out is ignored in zod mode (the schema already exists)");
  }
  if (options.out !== undefined) {
    writeFileChecked(path.resolve(options.out), code, options.force);
    stderr(`wrote ${options.out}`);
    return 0;
  }
  stdout(code);
  return 0;
};

const runTypeMode = (options: CliOptions): number => {
  const inputAbs = path.resolve(options.input);
  const { ir, typeName } = fromType(inputAbs, options.typeName);
  const schemaName = `${camelCase(typeName)}Schema`;
  const formName = options.name ?? deriveFormName(typeName);
  const schemaSource = emitZodSchema(ir, schemaName);
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
    writeFileChecked(schemaOutAbs, schemaSource, options.force);
    writeFileChecked(outAbs, code, options.force);
    stderr(`wrote ${schemaOutAbs}`);
    stderr(`wrote ${outAbs}`);
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

const invokedAsScript =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href.toLowerCase() ===
    import.meta.url.toLowerCase();

if (invokedAsScript) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
