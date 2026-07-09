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

// Every fixture is emitted once per backend, and each backend's outputs are
// typechecked as ONE program — ts.createProgram re-parses the library
// source, zod's types, and @types/react from scratch every call, so one
// program per compiler configuration (not per fixture) keeps the suite's
// cost flat as fixtures accumulate. The fixtures deliberately span the edge
// cases: hostile names (escaping), colliding array names (identifier
// suffixes), and a leaf-free schema (usage-gated helpers/imports).
const fixturesFor = (
  emit: Emitter,
  tag: string,
): Readonly<{
  dir: string;
  profile: Readonly<{ file: string; code: string }>;
  hostile: Readonly<{ file: string; code: string }>;
  colliding: Readonly<{ file: string; code: string }>;
  leafFree: Readonly<{ file: string; code: string }>;
  files: readonly string[];
}> => {
  const dir = freshTmpDir(`typecheck-${tag}`);
  const profile = generate(emit, profileSchema, "profileSchema", "ProfileForm", dir);
  const hostile = generate(emit, hostileSchema, "hostileSchema", "HostileForm", dir);
  const colliding = generate(emit, collidingSchema, "collidingSchema", "CollidingForm", dir);
  const leafFree = generate(emit, leafFreeSchema, "leafFreeSchema", "LeafFreeForm", dir);
  return {
    dir,
    profile,
    hostile,
    colliding,
    leafFree,
    files: [profile.file, hostile.file, colliding.file, leafFree.file],
  };
};

const plain = fixturesFor(emitPlainForm, "plain");
const mui = fixturesFor(emitMuiForm, "mui");
const shadcn = fixturesFor(emitShadcnForm, "shadcn");

describe("generated components", () => {
  // THE BIG ONE: every plain-backend output must typecheck against the real
  // library source ("formstand" mapped to ../../src/index.ts) with strict on
  // and zero diagnostics.
  it("plain outputs typecheck against the library source", () => {
    expect(typecheckDiagnostics(plain.files)).toEqual([]);
  });

  // The MUI variants typecheck too: @mui/material is mapped to a structural
  // stub declaring exactly the props the emitter uses.
  it("mui outputs typecheck against the library source and the MUI stub", () => {
    expect(typecheckDiagnostics(mui.files, muiStubPaths)).toEqual([]);
  });

  it("shadcn outputs typecheck against the library source and the shadcn stub", () => {
    expect(
      typecheckDiagnostics([...shadcn.files, shadcnStubFile]),
    ).toEqual([]);
    // The shadcn conventions the emitter promises: alias imports and
    // aria-invalid error styling (no MUI-style error/helperText props).
    expect(shadcn.profile.code).toContain('from "@/components/ui/input"');
    expect(shadcn.profile.code).toContain('"aria-invalid":');
    expect(shadcn.profile.code).not.toContain("helperText");
  });

  // The stub is typed with the emitter's shapes, so it can only prove
  // self-consistency; this run typechecks the same output against the repo's
  // real Radix-based components, so a shadcn/Radix prop-contract change
  // fails HERE instead of in every consumer's app.
  it("shadcn form typechecks against the real shadcn/Radix components", () => {
    expect(
      typecheckDiagnostics([shadcn.profile.file], realShadcnPaths),
    ).toEqual([]);
  });

  it("hostile field names: the dot field is skipped but initialized", () => {
    // No binding for the dot-in-name field...
    expect(plain.hostile.code).not.toContain('path={"a.b"}');
    expect(plain.hostile.code).toContain(
      '{/* TODO: field "a.b" skipped — "." in a key is not path-addressable',
    );
    // ...but initialValues still materializes the key.
    expect(plain.hostile.code).toContain('"a.b": "",');
    // The nested dot field inside array rows is skipped too.
    expect(plain.hostile.code).toContain(
      '{/* TODO: field "deep.dot" skipped — "." in a key is not path-addressable',
    );
  });

  it("colliding array names get suffixed identifiers", () => {
    expect(plain.colliding.code).toContain("const userNamesArray = ");
    expect(plain.colliding.code).toContain("const userNamesArray2 = ");
    expect(plain.colliding.code).toContain("type UserNamesItem2 = ");
    expect(plain.colliding.code).toContain("const emptyUserNamesItem2 = ");
  });

  // Leaf-free output must not reference usage-gated helpers/types whose
  // imports were (correctly) omitted — the typecheck programs above prove it
  // compiles; this pins the mechanism.
  it("leaf-free output omits BoundFieldProps in every backend", () => {
    expect(plain.leafFree.code).not.toContain("BoundFieldProps");
    expect(mui.leafFree.code).not.toContain("BoundFieldProps");
    expect(shadcn.leafFree.code).not.toContain("BoundFieldProps");
  });
});
