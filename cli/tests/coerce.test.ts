import { describe, expect, it } from "vitest";
import { fromZod } from "../src/fromZod";
import { freshTmpDir, typecheckDiagnostics, writeModuleFiles } from "./helpers";
import { coerceSchema } from "./fixtures/coerceSchema";

// z.coerce.number() keeps def.type "number" but parses ANY input, so
// z.input is `unknown`. The walker used to read the type and emit a number
// control whose path the input type refuses (and, in the module layout, a
// numberInputProps spread over an unknown-valued hook). Both failed to
// compile. A coerced schema now degrades to a TODO stand-in.

describe("z.coerce.* degrades to a TODO leaf", () => {
  const ir = fromZod(coerceSchema);
  const field = (name: string) =>
    ir.kind === "object" ? ir.fields.find((f) => f.name === name)?.spec : undefined;

  it("every coerced field is a text stand-in naming the unknown input type", () => {
    expect(field("coerced")).toMatchObject({
      kind: "string",
      todo: "z.coerce.number() is not supported: the input type is unknown, bind it by hand",
    });
    expect(field("d")).toMatchObject({
      kind: "string",
      todo: "z.coerce.date() is not supported: the input type is unknown, bind it by hand",
    });
    expect(field("b")).toMatchObject({
      kind: "string",
      todo: "z.coerce.boolean() is not supported: the input type is unknown, bind it by hand",
    });
    expect(field("plain")).toEqual({ kind: "string", optional: false, nullable: false });
  });

  // The module layout's field file pins a degraded leaf, so the module
  // compiles once the walker degrades the coerced fields (before, it bound
  // numberInputProps over an unknown-valued hook).
  it("the module layout compiles for a coerced schema", () => {
    const dir = freshTmpDir("coerce-module");
    const { written } = writeModuleFiles(coerceSchema, "coerceSchema", "CoerceForm", dir);
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});
