import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emitModuleForm } from "../src/moduleLayout";
import { emitPlainForm, emitZodSchema } from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { fromType } from "../src/fromType";
import { freshTmpDir, typecheckDiagnostics } from "./helpers";

// Tuples (z.tuple / [A, B]): fixed-arity positional lists. Each element binds
// at a STATIC numeric-index path (coord.0, coord.1) — no useFieldArray. This
// pins the IR both frontends produce, the single-file rendering, and — the
// real correctness check — that the emitted module typechecks against the
// library. (The single-file output is typechecked by typecheck.test.ts via
// the tupleSchema fixture.)

const emitPlain = (schema: unknown, formName: string): string => {
  const ir = fromZod(schema);
  return emitPlainForm({
    ir,
    formName,
    schemaImport: { name: "s", from: "./s", kind: "named" },
  });
};

describe("tuples — frontends produce a tuple IR", () => {
  it("fromZod reads a fixed tuple's elements", () => {
    const ir = fromZod(z.object({ coord: z.tuple([z.number(), z.string()]) }));
    if (ir.kind !== "object") throw new Error("object");
    const coord = ir.fields[0]!.spec;
    expect(coord.kind).toBe("tuple");
    if (coord.kind !== "tuple") return;
    expect(coord.elements.map((e) => e.kind)).toEqual(["number", "string"]);
  });

  it("fromZod flags a variadic rest but keeps the fixed head", () => {
    const ir = fromZod(
      z.object({ t: z.tuple([z.string(), z.number()], z.boolean()) }),
    );
    if (ir.kind !== "object") throw new Error("object");
    const t = ir.fields[0]!.spec;
    expect(t.kind).toBe("tuple");
    if (t.kind !== "tuple") return;
    expect(t.elements.map((e) => e.kind)).toEqual(["string", "number"]);
    expect(t.todo).toContain("rest");
  });

  it("a plain tuple with no rest carries no todo", () => {
    const ir = fromZod(z.object({ coord: z.tuple([z.number(), z.number()]) }));
    if (ir.kind !== "object") throw new Error("object");
    expect(ir.fields[0]!.spec.todo).toBeUndefined();
  });

  it("fromType reads a [number, string] tuple", () => {
    const file = path.join(freshTmpDir("tuple-type"), "shape.ts");
    fs.writeFileSync(
      file,
      "export interface Shape { coord: [number, string] }\n",
      "utf8",
    );
    const { ir } = fromType(file, "Shape");
    if (ir.kind !== "object") throw new Error("object");
    const coord = ir.fields[0]!.spec;
    expect(coord.kind).toBe("tuple");
    if (coord.kind !== "tuple") return;
    expect(coord.elements.map((e) => e.kind)).toEqual(["number", "string"]);
  });
});

describe("tuples — single-file rendering", () => {
  const code = emitPlain(
    z.object({ coord: z.tuple([z.number(), z.number()]), label: z.string() }),
    "CoordForm",
  );

  it("binds each element at a static numeric-index path", () => {
    expect(code).toContain('path={"coord.0"}');
    expect(code).toContain('path={"coord.1"}');
    expect(code).toContain("<NumberField");
    // No dynamic field array for a fixed-arity tuple.
    expect(code).not.toContain('useFieldArray(form, "coord")');
  });

  it("materializes every position in the initial values", () => {
    expect(code).toContain("coord: [undefined, undefined]");
  });

  it("emits z.tuple in the round-tripped schema", () => {
    const ir = fromZod(z.object({ coord: z.tuple([z.number(), z.number()]) }));
    expect(emitZodSchema(ir, "s")).toContain("z.tuple([z.number(), z.number()])");
  });

  it("degrades a non-scalar element to a TODO, still emitting the others", () => {
    const c = emitPlain(
      z.object({ mix: z.tuple([z.string(), z.object({ a: z.string() })]) }),
      "MixForm",
    );
    expect(c).toContain('path={"mix.0"}');
    expect(c).toContain("TODO: tuple element 1 (object)");
  });
});

describe("tuples — module layout", () => {
  const dir = freshTmpDir("tuple-module");
  const ir = fromZod(
    z.object({
      coord: z.tuple([z.number(), z.number()]),
      label: z.string(),
    }),
  );
  const files = emitModuleForm({
    ir,
    formName: "CoordForm",
    schemaImport: { name: "coordSchema", from: "./external", kind: "named" },
    schemaSource: emitZodSchema(ir, "coordSchema"),
  });
  const written = files.map((file) => {
    const dest = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    return dest;
  });

  it("generates a positional-leaf tuple section", () => {
    const section = files.find(
      (f) => f.path === "sections/CoordSection.tsx",
    );
    expect(section).toBeDefined();
    expect(section?.content).toContain('useCoordField("coord.0")');
    expect(section?.content).toContain('useCoordField("coord.1")');
  });

  it("the emitted plain module typechecks against the library", () => {
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});
