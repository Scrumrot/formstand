import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { moduleSpecifier } from "../src/cli";
import {
  type EmitFormOptions,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
} from "../src/codegen";
import { fromZod } from "../src/fromZod";
import {
  fixturesDir,
  freshTmpDir,
  muiStubPaths,
  realShadcnPaths,
  shadcnStubFile,
  typecheckDiagnostics,
} from "./helpers";
import { profileSchema } from "./fixtures/profileSchema";
import { hostileSchema } from "./fixtures/hostileSchema";
import { collidingSchema } from "./fixtures/collidingSchema";
import { leafFreeSchema } from "./fixtures/leafFreeSchema";

type Emitter = (options: EmitFormOptions) => string;

// Generate a component in `dir` bound to a named fixture schema and return
// the written file path alongside the code.
const generate = (
  emit: Emitter,
  schema: unknown,
  schemaName: string,
  formName: string,
  dir: string,
): Readonly<{ file: string; code: string }> => {
  const code = emit({
    ir: fromZod(schema),
    formName,
    schemaImport: {
      name: schemaName,
      from: moduleSpecifier(dir, path.join(fixturesDir, `${schemaName}.ts`)),
      kind: "named",
    },
  });
  const file = path.join(dir, `${formName}.tsx`);
  fs.writeFileSync(file, code, "utf8");
  return { file, code };
};

describe("generated components", () => {
  // THE BIG ONE: the generated plain-form component must typecheck against
  // the real library source ("formstand" mapped to ../../src/index.ts) with
  // strict on and zero diagnostics.
  it("plain form typechecks against the library source", () => {
    const dir = freshTmpDir("typecheck");
    const { file } = generate(
      emitPlainForm,
      profileSchema,
      "profileSchema",
      "ProfileForm",
      dir,
    );
    expect(typecheckDiagnostics([file])).toEqual([]);
  });

  // The MUI variant typechecks too: @mui/material is mapped to a structural
  // stub declaring exactly the props the emitter uses.
  it("mui form typechecks against the library source and the MUI stub", () => {
    const dir = freshTmpDir("typecheck-mui");
    const { file } = generate(
      emitMuiForm,
      profileSchema,
      "profileSchema",
      "ProfileForm",
      dir,
    );
    expect(typecheckDiagnostics([file], muiStubPaths)).toEqual([]);
  });

  it("hostile field names typecheck in plain output; the dot field is skipped but initialized", () => {
    const dir = freshTmpDir("typecheck-hostile");
    const { file, code } = generate(
      emitPlainForm,
      hostileSchema,
      "hostileSchema",
      "HostileForm",
      dir,
    );
    expect(typecheckDiagnostics([file])).toEqual([]);
    // No binding for the dot-in-name field...
    expect(code).not.toContain('path={"a.b"}');
    expect(code).toContain(
      '{/* TODO: field "a.b" skipped — "." in a key is not path-addressable',
    );
    // ...but initialValues still materializes the key.
    expect(code).toContain('"a.b": "",');
    // The nested dot field inside array rows is skipped too.
    expect(code).toContain(
      '{/* TODO: field "deep.dot" skipped — "." in a key is not path-addressable',
    );
  });

  // The shadcn variant typechecks too: the consumer's "@/components/ui/*"
  // modules are declared by a structural ambient stub.
  it("shadcn form typechecks against the library source and the shadcn stub", () => {
    const dir = freshTmpDir("typecheck-shadcn");
    const { file, code } = generate(
      emitShadcnForm,
      profileSchema,
      "profileSchema",
      "ProfileForm",
      dir,
    );
    expect(typecheckDiagnostics([file, shadcnStubFile])).toEqual([]);
    // The shadcn conventions the emitter promises: alias imports and
    // aria-invalid error styling (no MUI-style error/helperText props).
    expect(code).toContain('from "@/components/ui/input"');
    expect(code).toContain('"aria-invalid":');
    expect(code).not.toContain("helperText");
  });

  it("hostile field names typecheck in shadcn output", () => {
    const dir = freshTmpDir("typecheck-hostile-shadcn");
    const { file } = generate(
      emitShadcnForm,
      hostileSchema,
      "hostileSchema",
      "HostileForm",
      dir,
    );
    expect(typecheckDiagnostics([file, shadcnStubFile])).toEqual([]);
  });

  // The stub is typed with the emitter's shapes, so it can only prove
  // self-consistency; this run typechecks the same output against the repo's
  // real Radix-based components, so a shadcn/Radix prop-contract change
  // fails HERE instead of in every consumer's app.
  it("shadcn form typechecks against the real shadcn/Radix components", () => {
    const dir = freshTmpDir("typecheck-shadcn-real");
    const { file } = generate(
      emitShadcnForm,
      profileSchema,
      "profileSchema",
      "ProfileForm",
      dir,
    );
    expect(typecheckDiagnostics([file], realShadcnPaths)).toEqual([]);
  });

  // A schema with no scalar leaves must still emit compilable code: every
  // helper, type, and import in the preamble is usage-gated (BoundFieldProps
  // references FieldFormApi, whose import only exists when a leaf renders).
  it("leaf-free schemas emit compilable output in all three backends", () => {
    const dir = freshTmpDir("typecheck-leaf-free");
    const plain = generate(
      emitPlainForm,
      leafFreeSchema,
      "leafFreeSchema",
      "LeafFreePlainForm",
      dir,
    );
    const mui = generate(
      emitMuiForm,
      leafFreeSchema,
      "leafFreeSchema",
      "LeafFreeMuiForm",
      dir,
    );
    const shadcn = generate(
      emitShadcnForm,
      leafFreeSchema,
      "leafFreeSchema",
      "LeafFreeShadcnForm",
      dir,
    );
    expect(typecheckDiagnostics([plain.file])).toEqual([]);
    expect(typecheckDiagnostics([mui.file], muiStubPaths)).toEqual([]);
    expect(typecheckDiagnostics([shadcn.file, shadcnStubFile])).toEqual([]);
  });

  it("hostile field names typecheck in mui output", () => {
    const dir = freshTmpDir("typecheck-hostile-mui");
    const { file } = generate(
      emitMuiForm,
      hostileSchema,
      "hostileSchema",
      "HostileForm",
      dir,
    );
    expect(typecheckDiagnostics([file], muiStubPaths)).toEqual([]);
  });

  it("colliding array names get suffixed identifiers and typecheck", () => {
    const dir = freshTmpDir("typecheck-colliding");
    const { file, code } = generate(
      emitPlainForm,
      collidingSchema,
      "collidingSchema",
      "CollidingForm",
      dir,
    );
    expect(code).toContain("const userNamesArray = ");
    expect(code).toContain("const userNamesArray2 = ");
    expect(code).toContain("type UserNamesItem2 = ");
    expect(code).toContain("const emptyUserNamesItem2 = ");
    expect(typecheckDiagnostics([file])).toEqual([]);
  });
});
