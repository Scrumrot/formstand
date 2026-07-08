import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { FieldSpec } from "../src/ir";

export const testsDir = path.dirname(fileURLToPath(import.meta.url));
export const cliDir = path.resolve(testsDir, "..");
export const repoRoot = path.resolve(cliDir, "..");
export const fixturesDir = path.join(testsDir, "fixtures");

export const zodFixture = path.join(fixturesDir, "profileSchema.ts");
export const typeFixture = path.join(fixturesDir, "profileType.ts");
export const tupleFixture = path.join(fixturesDir, "tupleType.ts");
export const defaultExportFixture = path.join(fixturesDir, "schema.ts");

const posix = (p: string): string => p.replace(/\\/g, "/");

// Maps "@mui/material" onto the hand-written structural stub so MUI output is
// typechecked (not just parsed) without the real package installed.
export const muiStubPaths: Readonly<Record<string, readonly string[]>> = {
  "@mui/material": [posix(path.join(testsDir, "stubs", "mui-material.d.ts"))],
};

// The shadcn stub declares ambient "@/components/ui/*" modules, so it joins
// the program as an extra root file instead of a paths mapping.
export const shadcnStubFile = path.join(testsDir, "stubs", "shadcn-ui.d.ts");

const formatDiagnostic = (d: ts.Diagnostic): string => {
  const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file === undefined || d.start === undefined) return message;
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  return `${d.file.fileName}:${line + 1} ${message}`;
};

// The in-process typecheck harness: strict, react-jsx, with both bare
// specifiers pinned to single copies — "formstand" to the library source and
// "zod" to the root copy the library itself resolves — so the fixture's
// schema type and the library's z.ZodType are the same declarations.
export const typecheckDiagnostics = (
  files: readonly string[],
  extraPaths: Readonly<Record<string, readonly string[]>> = {},
): readonly string[] => {
  const program = ts.createProgram([...files], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
    paths: Object.fromEntries(
      Object.entries({
        formstand: [posix(path.join(repoRoot, "src", "index.ts"))],
        zod: [posix(path.join(repoRoot, "node_modules", "zod", "index.d.ts"))],
        ...extraPaths,
      }).map(([key, value]) => [key, [...value]]),
    ),
  });
  return [
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ].map(formatDiagnostic);
};

// A clean per-suite scratch directory under tests/.tmp (git- and
// eslint-ignored).
export const freshTmpDir = (name: string): string => {
  const dir = path.join(testsDir, ".tmp", name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// Enum option order is not guaranteed identical between the zod walk
// (declaration order) and the TS checker (which may reorder union members):
// sort options before comparing IRs across frontends.
export const normalizeIr = (spec: FieldSpec): FieldSpec => {
  switch (spec.kind) {
    case "enum":
      return { ...spec, options: [...spec.options].sort() };
    case "object":
      return {
        ...spec,
        fields: spec.fields.map((field) => ({
          ...field,
          spec: normalizeIr(field.spec),
        })),
      };
    case "array":
      return { ...spec, item: normalizeIr(spec.item) };
    default:
      return spec;
  }
};
