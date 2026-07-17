import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { moduleSpecifier } from "../src/cli";
import {
  blankNeedsCast,
  emitInitialValues,
  emitPlainForm,
} from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { fixturesDir, freshTmpDir, typecheckDiagnostics } from "./helpers";
import { defaultsSchema } from "./fixtures/defaultsSchema";

// `.default()` values must land in the generated initialValues whenever the
// captured value is a JSON-serializable primitive matching the field kind
// (string / finite number / boolean / declared enum option); dates and
// container defaults keep the blank-form behavior. The value is captured
// off the zod def (`defaultValue` — a resolved value in zod v4, a factory
// in older shapes) into the IR's `defaultValue`.

describe("fromZod default capture", () => {
  it("captures value and factory defaults, and prefault", () => {
    const ir = fromZod(
      z.object({
        plain: z.string().default("x"),
        factory: z.number().default(() => 7),
        pre: z.string().prefault("y"),
      }),
    );
    if (ir.kind !== "object") throw new Error("expected object root");
    expect(ir.fields.map((f) => f.spec.defaultValue)).toEqual(["x", 7, "y"]);
    // A defaulted field stays optional in z.input.
    expect(ir.fields.every((f) => f.spec.optional)).toBe(true);
  });
});

describe("defaults in emitInitialValues", () => {
  const values = emitInitialValues(fromZod(defaultsSchema), 0);

  it("seeds matching primitive defaults", () => {
    expect(values).toContain('theme: "light",');
    expect(values).toContain("retries: 3,");
    expect(values).toContain("newsletter: true,");
    expect(values).toContain('plan: "pro",');
    // A factory default is called and its value captured.
    expect(values).toContain("factory: 42,");
    // Escaping goes through the shared string-literal helper.
    expect(values).toContain('quoted: "say \\"hi\\"",');
  });

  it("skips dates and containers (blank-form behavior)", () => {
    // No Date literal exists in source; the optional date starts undefined.
    expect(values).toContain("createdAt: undefined,");
    // A container default is ignored; arrays always start empty.
    expect(values).toContain("tags: [],");
  });

  it("skips a default that does not match the field kind", () => {
    const ir = fromZod(
      z.object({
        // "gold" is not a declared option — seeding it would emit a type
        // error, so the enum falls back to its blank behavior.
        plan: z.enum(["free", "pro"]).default("gold" as "free"),
      }),
    );
    expect(emitInitialValues(ir, 0)).toContain("plan: undefined,");
  });

  it("a seeded default satisfies z.input, avoiding the blank cast", () => {
    // Every field is defaulted or blankable, so the draft gets the checked
    // annotation, not the as-unknown-as escape hatch.
    expect(blankNeedsCast(fromZod(defaultsSchema))).toBe(false);
  });
});

describe("defaults end to end", () => {
  it("the generated component carries the defaults and typechecks", () => {
    const dir = freshTmpDir("defaults-plain");
    const code = emitPlainForm({
      ir: fromZod(defaultsSchema),
      formName: "DefaultsForm",
      schemaImport: {
        name: "defaultsSchema",
        from: moduleSpecifier(dir, path.join(fixturesDir, "defaultsSchema.ts")),
        kind: "named",
      },
    });
    expect(code).toContain('theme: "light",');
    expect(code).toContain("const initialValues: FormValues =");
    expect(code).not.toContain("as unknown as FormValues");
    const file = path.join(dir, "DefaultsForm.tsx");
    fs.writeFileSync(file, code, "utf8");
    expect(typecheckDiagnostics([file])).toEqual([]);
  });
});
