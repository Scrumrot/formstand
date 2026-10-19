import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { main } from "../src/cli";
import { emitZodSchema, unmodeledCheckPaths } from "../src/codegen";
import { fromJsonSchema } from "../src/fromJsonSchema";
import { fromZod } from "../src/fromZod";
import type { FieldSpec, NamedField } from "../src/ir";
import {
  captureStderr,
  fixturesDir,
  freshTmpDir,
  specPaths,
  typecheckDiagnostics,
} from "./helpers";

// OpenAPI 3.0 spellings the walker used to lose or refuse (nullable beside
// a $ref or an allOf, a single-branch allOf wrapping a non-object, null in
// an enum list, $ref chains, nested allOf, percent-encoded pointers), and
// the string/number keywords it dropped from the emitted validator without
// a word (pattern, multipleOf, a format outside the mapped three).

const idiomsFixture = path.join(fixturesDir, "openapi30Idioms.json");
const document: unknown = JSON.parse(fs.readFileSync(idiomsFixture, "utf8"));
const OPTS = {
  source: "openapi30Idioms.json",
  fallbackName: "Fixture",
  select: "Profile",
} as const;

const fieldOf = (ir: FieldSpec, name: string): NamedField => {
  if (ir.kind !== "object") throw new Error("expected object root");
  const field = ir.fields.find((candidate) => candidate.name === name);
  if (field === undefined) throw new Error(`no field "${name}"`);
  return field;
};

describe("fromJsonSchema, OpenAPI 3.0 nullable and allOf idioms", () => {
  const { ir } = fromJsonSchema(document, OPTS);

  it("nullable beside a $ref applies to the resolved target", () => {
    const spec = fieldOf(ir, "refStatus").spec;
    expect(spec.kind).toBe("enum");
    expect(spec.nullable).toBe(true);
    expect(spec.optional).toBe(false);
    // The target's own description still rides along (the site has none).
    expect(spec.description).toBe("The component's own description");
  });

  it("a single-branch allOf around a non-object is that branch plus the outer keywords", () => {
    const spec = fieldOf(ir, "status").spec;
    expect(spec.todo).toBeUndefined();
    if (spec.kind !== "enum") throw new Error("expected enum");
    expect(spec.options).toEqual(["active", "inactive"]);
    expect(spec.nullable).toBe(true);
    // The site's description wins over the target's (outermost wins).
    expect(spec.description).toBe("Current status");
  });

  it("an allOf merge keeps the outer nullable and description", () => {
    const spec = fieldOf(ir, "merged").spec;
    if (spec.kind !== "object") throw new Error("expected object");
    expect(spec.nullable).toBe(true);
    expect(spec.description).toBe("Merged with outer keywords");
    expect(spec.fields.map((f) => f.name)).toEqual(["id", "extra"]);
  });

  it("null in an enum list is stripped and marks the field nullable, in both spellings", () => {
    const mode = fieldOf(ir, "mode").spec;
    if (mode.kind !== "enum") throw new Error("expected enum (3.0 spelling)");
    expect(mode.options).toEqual(["a", "b"]);
    expect(mode.nullable).toBe(true);
    const mode31 = fieldOf(ir, "mode31").spec;
    if (mode31.kind !== "enum") throw new Error("expected enum (3.1 spelling)");
    expect(mode31.options).toEqual(["x", "y"]);
    expect(mode31.nullable).toBe(true);
  });

  it("allOf branches that are themselves allOf, and $ref chains, resolve", () => {
    const leaf = fieldOf(ir, "leaf").spec;
    if (leaf.kind !== "object") throw new Error("expected object (nested allOf)");
    expect(leaf.fields.map((f) => f.name)).toEqual(["id", "mid", "leaf"]);
    expect(leaf.fields.find((f) => f.name === "id")?.spec.optional).toBe(false);
    expect(leaf.fields.find((f) => f.name === "leaf")?.spec.optional).toBe(false);
    const alias = fieldOf(ir, "alias").spec;
    if (alias.kind !== "object") throw new Error("expected object ($ref chain)");
    expect(alias.fields.map((f) => f.name)).toEqual(["id"]);
  });

  it("JSON pointer segments are percent-decoded", () => {
    const spaced = fieldOf(ir, "spaced").spec;
    if (spaced.kind !== "object") throw new Error("expected object");
    expect(spaced.fields.map((f) => f.name)).toEqual(["spaced"]);
    // --schema takes the encoded pointer too, and the escapes of RFC 6901.
    const picked = fromJsonSchema(document, {
      ...OPTS,
      select: "#/components/schemas/My%20Type",
    });
    expect(picked.ir.kind).toBe("object");
    const escaped = fromJsonSchema(
      { $defs: { "a/b~c": { type: "string" } }, $ref: "#/$defs/a~1b~0c" },
      { source: "x.json", fallbackName: "X" },
    );
    expect(escaped.ir.kind).toBe("string");
    expect(escaped.ir.todo).toBeUndefined();
  });
});

describe("fromJsonSchema, string and number keywords reach the validator", () => {
  const { ir } = fromJsonSchema(document, OPTS);
  const schema = emitZodSchema(ir, "profileSchema");

  it("pattern becomes .regex() when it compiles, a TODO when it does not", () => {
    const code = fieldOf(ir, "code").spec;
    if (code.kind !== "string") throw new Error("expected string");
    expect(code.checks?.regex).toBe("^[A-Z]{3}$");
    expect(code.todo).toBeUndefined();
    expect(schema).toContain('code: z.string().regex(new RegExp("^[A-Z]{3}$"))');
    const bad = fieldOf(ir, "badCode").spec;
    expect(bad.todo).toContain("pattern");
    expect(bad.todo).toContain("not a valid JavaScript regular expression");
    // The bad pattern survives only in the TODO comment, never as a
    // .regex() call that would throw when the module loads.
    expect(schema).toContain("// TODO: pattern");
    expect(schema).not.toContain('.regex(new RegExp("(unclosed');
  });

  it("multipleOf becomes .multipleOf()", () => {
    const step = fieldOf(ir, "step").spec;
    if (step.kind !== "number") throw new Error("expected number");
    expect(step.checks?.multipleOf).toBe(0.5);
    expect(schema).toContain("step: z.number().multipleOf(0.5)");
  });

  it("pattern, multipleOf, and an unmapped format are recorded as unmodeled checks", () => {
    expect(unmodeledCheckPaths(ir)).toEqual([
      { path: "code", checks: ["pattern"] },
      { path: "step", checks: ["multipleOf"] },
      { path: "ip", checks: ["ipv4"] },
    ]);
    // The unmapped format keeps a plain text control and an unconstrained
    // string in the schema (no zod spelling exists for it).
    expect(fieldOf(ir, "ip").spec.kind).toBe("string");
    expect(fieldOf(ir, "ip").spec.todo).toBeUndefined();
  });

  it("draft-04 exclusiveMinimum: true beside minimum is an exclusive bound", () => {
    const count = fieldOf(ir, "count").spec;
    if (count.kind !== "number") throw new Error("expected number");
    expect(count.checks).toEqual({ int: true, min: 5, minExclusive: true });
    expect(schema).toContain("count: z.number().int().gt(5)");
  });

  it("an empty enum list degrades to a TODO in both walkers", () => {
    const nothing = fieldOf(ir, "nothing").spec;
    expect(nothing.kind).toBe("string");
    expect(nothing.todo).toContain("empty enum");
    expect(schema).not.toContain("z.enum([])");
    // zod constructs z.enum([]) without complaint, and then rejects every
    // value: no control can satisfy it either.
    const zodIr = fromZod(z.object({ nothing: z.enum([]) }));
    expect(fieldOf(zodIr, "nothing").spec.todo).toContain("empty enum");
  });

  it("the emitted schema, component, and spec typecheck, and the spec skips the blind round trip", async () => {
    const dir = freshTmpDir("json-idioms-cli");
    const out = path.join(dir, "ProfileForm.tsx");
    const text = await captureStderr(async () => {
      expect(
        await main([
          idiomsFixture,
          "--schema",
          "Profile",
          "--tests",
          "vitest",
          "--out",
          out,
        ]),
      ).toBe(0);
    });
    const schemaOut = path.join(dir, "profileSchema.ts");
    const written = fs.readFileSync(schemaOut, "utf8");
    expect(written).toContain('z.enum(["active", "inactive"]).nullable()');
    expect(written).toContain(".regex(new RegExp(");
    expect(written).toContain(".multipleOf(0.5)");
    expect(text).toContain('warning: field "code" has checks the generator does not model (pattern)');
    expect(text).toContain('warning: field "ip" has checks the generator does not model (ipv4)');
    const spec = fs.readFileSync(path.join(dir, "ProfileForm.test.tsx"), "utf8");
    expect(spec).toContain("it.skip(");
    expect(
      typecheckDiagnostics([schemaOut, out, path.join(dir, "ProfileForm.test.tsx")], specPaths),
    ).toEqual([]);
  });
});
