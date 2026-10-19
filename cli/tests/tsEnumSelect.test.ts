import { describe, expect, it } from "vitest";
import { emitPlainForm } from "../src/codegen";
import { fromZod } from "../src/fromZod";
import {
  freshTmpDir,
  typecheckDiagnostics,
  writeModuleFiles,
  writeSingleFile,
} from "./helpers";
import { tsEnumSchema } from "./fixtures/tsEnumSchema";

// z.enum(Color) over a TypeScript enum: z.input is the enum TYPE, and the
// library's SelectField checks each option literal against it, so the plain
// single-file emitter's `{ value: "red" }` was a compile error. The walker
// now marks such enums, and plain binds them through the raw select builder
// in an in-file EnumSelectField; the module layout and the kits already did
// (their selects are pinned to string).

describe("TS-enum-backed z.enum compiles in the plain single-file layout", () => {
  const dir = freshTmpDir("ts-enum-single");
  const plain = writeSingleFile(emitPlainForm, tsEnumSchema, "tsEnumSchema", "TsEnumForm", dir);

  it("binds the enum-backed selects through the raw builder, the plain enum through SelectField", () => {
    expect(typecheckDiagnostics([plain.file])).toEqual([]);
    expect(plain.code).toContain('<SelectField\n        form={form}\n        path={"size"}');
    expect(plain.code).not.toContain('<SelectField\n        form={form}\n        path={"color"}');
    expect(plain.code).toContain('<EnumSelectField\n        form={form}\n        path={"color"}');
    expect(plain.code).toContain('<EnumSelectField\n        form={form}\n        path={"shade"}');
    // The runtime values are still the enum's values, not its keys.
    expect(plain.code).toContain('{ value: "red", label: "Red" }');
    expect(plain.code).not.toContain('value: "Red"');
    expect(plain.code).toContain("<select\n          {...selectProps(field)}");
  });

  it("the walker marks the enum as TS-enum-backed", () => {
    const ir = fromZod(tsEnumSchema);
    const spec = (name: string) =>
      ir.kind === "object" ? ir.fields.find((f) => f.name === name)?.spec : undefined;
    expect(spec("color")).toMatchObject({ kind: "enum", tsEnum: true });
    expect(spec("shade")).toMatchObject({ kind: "enum", tsEnum: true, optional: true });
    expect(spec("size")).not.toHaveProperty("tsEnum");
  });

  it("the module layout (raw selectProps already) still compiles", () => {
    const moduleDir = freshTmpDir("ts-enum-module");
    const { written } = writeModuleFiles(tsEnumSchema, "tsEnumSchema", "TsEnumForm", moduleDir);
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});
