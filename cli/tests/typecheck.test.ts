import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { moduleSpecifier } from "../src/cli";
import {
  type EmitFormOptions,
  type VisualOptions,
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
import { tupleSchema } from "./fixtures/tupleSchema";

type Emitter = (options: EmitFormOptions) => string;

// Generate a component in `dir` bound to a named fixture schema and return
// the written file path alongside the code.
const generate = (
  emit: Emitter,
  schema: unknown,
  schemaName: string,
  formName: string,
  dir: string,
  visual?: VisualOptions,
): Readonly<{ file: string; code: string }> => {
  const code = emit({
    ir: fromZod(schema),
    formName,
    schemaImport: {
      name: schemaName,
      from: moduleSpecifier(dir, path.join(fixturesDir, `${schemaName}.ts`)),
      kind: "named",
    },
    ...(visual === undefined ? {} : { visual }),
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
  tuple: Readonly<{ file: string; code: string }>;
  panel: Readonly<{ file: string; code: string }>;
  collapsible: Readonly<{ file: string; code: string }>;
  files: readonly string[];
}> => {
  const dir = freshTmpDir(`typecheck-${tag}`);
  const profile = generate(emit, profileSchema, "profileSchema", "ProfileForm", dir);
  const hostile = generate(emit, hostileSchema, "hostileSchema", "HostileForm", dir);
  const colliding = generate(emit, collidingSchema, "collidingSchema", "CollidingForm", dir);
  const leafFree = generate(emit, leafFreeSchema, "leafFreeSchema", "LeafFreeForm", dir);
  const tuple = generate(emit, tupleSchema, "tupleSchema", "TupleForm", dir);
  // The visual axes ride in the same program: panel + 2 columns and
  // collapsible + 3 columns cover every non-default wrapper and grid.
  const panel = generate(emit, profileSchema, "profileSchema", "PanelForm", dir, {
    sections: "panel",
    columns: 2,
  });
  const collapsible = generate(
    emit,
    profileSchema,
    "profileSchema",
    "CollapsibleForm",
    dir,
    { sections: "collapsible", columns: 3 },
  );
  return {
    dir,
    profile,
    hostile,
    colliding,
    leafFree,
    tuple,
    panel,
    collapsible,
    files: [
      profile.file,
      hostile.file,
      colliding.file,
      leafFree.file,
      tuple.file,
      panel.file,
      collapsible.file,
    ],
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
    // Cast-agnostic: string items get a checked annotation, not the cast.
    expect(plain.colliding.code).toContain("const emptyUserNamesItem2");
  });

  // --sections/--columns land in the section wrappers; the typecheck
  // programs above already prove the variants compile, so these pin the
  // shape of the chrome and that imports stay usage-gated.
  it("panel and columns render per-ui section chrome and grids", () => {
    expect(plain.panel.code).toContain('border: "1px solid #d0d7e2"');
    expect(plain.panel.code).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
    expect(mui.panel.code).toContain('<Card variant="outlined"');
    expect(mui.panel.code).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
    expect(shadcn.panel.code).toContain("bg-card text-card-foreground shadow-sm");
    expect(shadcn.panel.code).toContain("md:grid-cols-2");
  });

  it("collapsible renders details/summary (Accordion on mui)", () => {
    expect(plain.collapsible.code).toContain("<details open");
    expect(mui.collapsible.code).toContain("<Accordion defaultExpanded");
    expect(shadcn.collapsible.code).toContain("<details open");
  });

  it("the flat default keeps the historical output and gates the imports", () => {
    expect(mui.profile.code).toContain("<Stack spacing={2}>");
    expect(mui.profile.code).not.toContain("Card");
    expect(mui.profile.code).not.toContain("Accordion");
    expect(shadcn.profile.code).not.toContain("bg-card");
  });

  // The blank-draft cast is emitted only when the draft genuinely can't
  // typecheck (a required number/date/enum starts undefined); otherwise the
  // initial values get a checked annotation — the typecheck programs above
  // prove the annotated form actually compiles.
  it("initialValues are cast only when the blank draft needs it", () => {
    // profileSchema's required `role` enum forces the cast...
    expect(plain.profile.code).toContain("as unknown as FormValues");
    // ...but leafFreeSchema's blank draft is fully legal: checked, not cast.
    expect(plain.leafFree.code).toContain("const initialValues: FormValues =");
    expect(plain.leafFree.code).not.toContain("as unknown as FormValues");
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
