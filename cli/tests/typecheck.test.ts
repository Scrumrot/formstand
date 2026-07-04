import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { emitMuiForm, emitPlainForm } from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { fixturesDir, freshTmpDir, repoRoot } from "./helpers";
import { profileSchema } from "./fixtures/profileSchema";

const posix = (p: string): string => p.replace(/\\/g, "/");

const specifierTo = (fromDir: string, targetAbs: string): string => {
  const rel = posix(path.relative(fromDir, targetAbs)).replace(/\.ts$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
};

const formatDiagnostic = (d: ts.Diagnostic): string => {
  const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file === undefined || d.start === undefined) return message;
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  return `${d.file.fileName}:${line + 1} ${message}`;
};

describe("generated components", () => {
  // THE BIG ONE: the generated plain-form component must typecheck against
  // the real library source ("formstand" mapped to ../../src/index.ts) with
  // strict on and zero diagnostics.
  it("plain form typechecks against the library source", () => {
    const dir = freshTmpDir("typecheck");
    const ir = fromZod(profileSchema);
    const code = emitPlainForm({
      ir,
      formName: "ProfileForm",
      schemaImport: {
        name: "profileSchema",
        from: specifierTo(dir, path.join(fixturesDir, "profileSchema.ts")),
        kind: "named",
      },
    });
    const file = path.join(dir, "ProfileForm.tsx");
    fs.writeFileSync(file, code, "utf8");

    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
      // Pin both bare specifiers to single copies: "formstand" to the library
      // source, "zod" to the root copy the library itself resolves — so the
      // fixture's schema type and the library's z.ZodType are the same
      // declarations.
      paths: {
        formstand: [posix(path.join(repoRoot, "src", "index.ts"))],
        zod: [posix(path.join(repoRoot, "node_modules", "zod", "index.d.ts"))],
      },
    });
    const diagnostics = [
      ...program.getSyntacticDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSemanticDiagnostics(),
    ];
    expect(diagnostics.map(formatDiagnostic)).toEqual([]);
  });

  // @mui/material is not installed here, so the MUI variant is only checked
  // for being syntactically valid TSX.
  it("mui form parses as valid TSX", () => {
    const ir = fromZod(profileSchema);
    const code = emitMuiForm({
      ir,
      formName: "ProfileForm",
      schemaImport: {
        name: "profileSchema",
        from: "./profileSchema",
        kind: "named",
      },
    });
    const result = ts.transpileModule(code, {
      fileName: "ProfileForm.tsx",
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    expect((result.diagnostics ?? []).map(formatDiagnostic)).toEqual([]);
  });
});
