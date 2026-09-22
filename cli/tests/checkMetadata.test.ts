import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emitZodSchema } from "../src/codegen";
import { fromJsonSchema } from "../src/fromJsonSchema";
import { fromType } from "../src/fromType";
import { fromZod } from "../src/fromZod";
import type { FieldSpec, NamedField } from "../src/ir";
import { collectTestPlan, emitValidValues } from "../src/testCases";
import { emitComponentSpec } from "../src/testsEmit";
import { freshTmpDir } from "./helpers";

// Check-metadata enrichment: the zod and JSON Schema front-ends capture
// string/array length bounds and number bounds into `checks`, the schema
// emitter re-emits them so a generated validator round-trips, and the
// generated-tests plan derives bound and array-minimum cases from them.

const fieldOf = (ir: FieldSpec, name: string): NamedField => {
  if (ir.kind !== "object") throw new Error("expected object root");
  const field = ir.fields.find((candidate) => candidate.name === name);
  if (field === undefined) throw new Error(`no field "${name}"`);
  return field;
};

const checksOf = (ir: FieldSpec, name: string): unknown => {
  const spec = fieldOf(ir, name).spec;
  return "checks" in spec ? spec.checks : undefined;
};

const bounded = z.object({
  name: z.string().min(3).max(9),
  code: z.string().length(4),
  age: z.number().min(18).max(99),
  score: z.number().gt(0).int(),
  ratio: z.number().lt(1),
  count: z.int(),
  tags: z.array(z.string()).min(1).max(5),
  plain: z.string(),
  amount: z.number(),
  rows: z.array(z.number()),
});

describe("fromZod captures checks", () => {
  const ir = fromZod(bounded);

  it("string length bounds, with .length() as both edges", () => {
    expect(checksOf(ir, "name")).toEqual({ minLength: 3, maxLength: 9 });
    expect(checksOf(ir, "code")).toEqual({ minLength: 4, maxLength: 4 });
  });

  it("number bounds with exclusivity flags, and integrality", () => {
    expect(checksOf(ir, "age")).toEqual({ min: 18, max: 99 });
    expect(checksOf(ir, "score")).toEqual({ int: true, min: 0, minExclusive: true });
    expect(checksOf(ir, "ratio")).toEqual({ max: 1, maxExclusive: true });
    expect(checksOf(ir, "count")).toEqual({ int: true });
  });

  it("array row-count bounds", () => {
    expect(checksOf(ir, "tags")).toEqual({ minLength: 1, maxLength: 5 });
  });

  it("leaves unconstrained fields without a checks member at all", () => {
    expect(fieldOf(ir, "plain").spec).not.toHaveProperty("checks");
    expect(fieldOf(ir, "amount").spec).not.toHaveProperty("checks");
    expect(fieldOf(ir, "rows").spec).not.toHaveProperty("checks");
  });

  it("keeps the tightest of repeated bounds", () => {
    const ir2 = fromZod(
      z.object({
        s: z.string().min(2).min(5).max(20).max(10),
        n: z.number().gte(1).gt(3).lte(50).lt(40),
      }),
    );
    expect(checksOf(ir2, "s")).toEqual({ minLength: 5, maxLength: 10 });
    expect(checksOf(ir2, "n")).toEqual({
      min: 3,
      minExclusive: true,
      max: 40,
      maxExclusive: true,
    });
  });

  it("survives wrappers: optional/nullable/default around a bounded leaf", () => {
    const ir2 = fromZod(
      z.object({
        a: z.string().min(2).optional(),
        b: z.number().max(5).nullable(),
        c: z.array(z.string()).min(2).default([]),
      }),
    );
    expect(checksOf(ir2, "a")).toEqual({ minLength: 2 });
    expect(checksOf(ir2, "b")).toEqual({ max: 5 });
    expect(checksOf(ir2, "c")).toEqual({ minLength: 2 });
  });
});

describe("fromJsonSchema captures checks", () => {
  const OPTS = { source: "fixture.json", fallbackName: "Fixture" } as const;
  const { ir } = fromJsonSchema(
    {
      type: "object",
      properties: {
        name: { type: "string", minLength: 3, maxLength: 9 },
        age: { type: "number", minimum: 18, maximum: 99 },
        score: { type: "integer", exclusiveMinimum: 0 },
        ratio: { type: "number", exclusiveMaximum: 1 },
        count: { type: "integer" },
        tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
        plain: { type: "string" },
        // A string-typed bound (seen in hand-written schemas) is not a
        // bound: emitting it would produce a validator zod rejects.
        junk: { type: "number", minimum: "5" },
        // Both spellings present: the tighter wins.
        both: { type: "number", minimum: 1, exclusiveMinimum: 2, maximum: 9, exclusiveMaximum: 10 },
      },
      required: ["name", "age", "score", "ratio", "count", "tags", "plain", "junk", "both"],
    },
    OPTS,
  );

  it("maps minLength/maxLength, minimum/maximum, minItems/maxItems", () => {
    expect(checksOf(ir, "name")).toEqual({ minLength: 3, maxLength: 9 });
    expect(checksOf(ir, "age")).toEqual({ min: 18, max: 99 });
    expect(checksOf(ir, "tags")).toEqual({ minLength: 1, maxLength: 5 });
  });

  it("maps 2020-12 numeric exclusive bounds and `integer` to int", () => {
    expect(checksOf(ir, "score")).toEqual({ int: true, min: 0, minExclusive: true });
    expect(checksOf(ir, "ratio")).toEqual({ max: 1, maxExclusive: true });
    expect(checksOf(ir, "count")).toEqual({ int: true });
  });

  it("ignores non-numeric bounds and leaves unconstrained fields bare", () => {
    expect(fieldOf(ir, "junk").spec).not.toHaveProperty("checks");
    expect(fieldOf(ir, "plain").spec).not.toHaveProperty("checks");
  });

  it("keeps the tighter of inclusive and exclusive spellings", () => {
    expect(checksOf(ir, "both")).toEqual({
      min: 2,
      minExclusive: true,
      max: 9,
    });
  });

  it("matches the zod walk of the mirrored schema", () => {
    const zodIr = fromZod(
      z.object({
        name: z.string().min(3).max(9),
        age: z.number().min(18).max(99),
        score: z.int().gt(0),
        ratio: z.number().lt(1),
        count: z.int(),
        tags: z.array(z.string()).min(1).max(5),
        plain: z.string(),
      }),
    );
    for (const name of ["name", "age", "score", "ratio", "count", "tags", "plain"]) {
      expect(checksOf(ir, name), name).toEqual(checksOf(zodIr, name));
    }
  });
});

describe("fromType never sets checks", () => {
  it("a TS type carries no bounds, so no checks member appears", () => {
    const dir = freshTmpDir("checks-type");
    const file = path.join(dir, "shape.ts");
    fs.writeFileSync(
      file,
      "export type Shape = { name: string; age: number; tags: string[] };\n",
      "utf8",
    );
    const { ir } = fromType(file, "Shape");
    expect(fieldOf(ir, "name").spec).not.toHaveProperty("checks");
    expect(fieldOf(ir, "age").spec).not.toHaveProperty("checks");
    expect(fieldOf(ir, "tags").spec).not.toHaveProperty("checks");
  });
});

describe("emitZodSchema round-trips checks", () => {
  const ir = fromZod(bounded);
  const source = emitZodSchema(ir, "boundedSchema");

  it("emits the zod method chains", () => {
    expect(source).toContain("name: z.string().min(3).max(9),");
    expect(source).toContain("code: z.string().min(4).max(4),");
    expect(source).toContain("age: z.number().gte(18).lte(99),");
    expect(source).toContain("score: z.number().int().gt(0),");
    expect(source).toContain("ratio: z.number().lt(1),");
    expect(source).toContain("count: z.number().int(),");
    expect(source).toContain("tags: z.array(z.string()).min(1).max(5),");
    expect(source).toContain("plain: z.string(),");
    expect(source).toContain("rows: z.array(z.number()),");
  });

  it("the emitted source loads and walks back to the same IR", async () => {
    const dir = freshTmpDir("checks-roundtrip");
    const file = path.join(dir, "boundedSchema.ts");
    fs.writeFileSync(file, source, "utf8");
    const jiti = createJiti(import.meta.url);
    const mod = (await jiti.import(pathToFileURL(file).href)) as Readonly<
      Record<string, unknown>
    >;
    expect(fromZod(mod["boundedSchema"])).toEqual(ir);
  });
});

describe("the generated-tests plan consumes checks", () => {
  const schema = z.object({
    name: z.string().min(3).max(9),
    nickname: z.string().max(4),
    age: z.number().min(18).max(99),
    score: z.number().gt(0).int(),
    ratio: z.number().lt(1),
    count: z.int(),
    tags: z.array(z.string()).min(2),
    maybeTags: z.array(z.string()).min(1).optional(),
    plain: z.string(),
    rows: z.array(z.number()),
  });
  const ir = fromZod(schema);
  const plan = collectTestPlan(ir);

  it("a minimum length makes a string blank-invalid; a maximum alone does not", () => {
    expect(plan.requiredPaths.map((entry) => entry.path)).toEqual([
      "name",
      "age",
      "score",
      "ratio",
      "count",
    ]);
  });

  it("arrays with a row minimum fail the blank form even when optional", () => {
    // [] is what the blank form holds either way, and [] is defined.
    expect(plan.arrayMinPaths.map((entry) => entry.path)).toEqual([
      "tags",
      "maybeTags",
    ]);
    // The render-layer blank-submit case still picks a labeled control.
    expect(plan.firstInvalidLabel).toBe("Name");
  });

  it("one probe per bounded field, minimum first, then maximum, then int", () => {
    expect(plan.boundChecks).toEqual([
      { path: "name", label: "Name", reason: "shorter than 3 characters", bad: '"xx"', good: '"filled"' },
      { path: "nickname", label: "Nickname", reason: "longer than 4 characters", bad: '"xxxxx"', good: '"fill"' },
      { path: "age", label: "Age", reason: "below 18", bad: "17", good: "18" },
      { path: "score", label: "Score", reason: "at or below 0", bad: "0", good: "1" },
      { path: "ratio", label: "Ratio", reason: "at or above 1", bad: "1", good: "0" },
      { path: "count", label: "Count", reason: "that is not an integer", bad: "1.5", good: "1" },
    ]);
  });

  it("the valid literal honors every bound and parses through the schema", () => {
    const literal = emitValidValues(ir);
    expect(literal).toContain('name: "filled"');
    expect(literal).toContain('nickname: "fill"');
    expect(literal).toContain('tags: ["filled", "filled"]');
    expect(literal).toContain('maybeTags: ["filled"]');
    expect(literal).toContain("rows: []");
    const values: unknown = new Function(`return ${literal};`)();
    expect(schema.safeParse(values).success).toBe(true);
  });

  it("stretches a long minimum and rounds an int up past a fractional edge", () => {
    const ir2 = fromZod(
      z.object({
        long: z.string().min(10),
        half: z.int().gt(0.5),
        top: z.number().max(-3),
      }),
    );
    expect(emitValidValues(ir2)).toContain('long: "filledxxxx"');
    expect(emitValidValues(ir2)).toContain("half: 1");
    expect(emitValidValues(ir2)).toContain("top: -3");
    // Render/browser fills carry the same samples.
    expect(collectTestPlan(ir2).labelFills).toEqual([
      { label: "Long", text: "filledxxxx" },
      { label: "Half", text: "1" },
      { label: "Top", text: "-3" },
    ]);
  });

  it("a formatted string keeps its format sample and gets no bound probe", () => {
    const ir2 = fromZod(z.object({ email: z.email().min(3) }));
    const plan2 = collectTestPlan(ir2);
    expect(plan2.boundChecks).toEqual([]);
    expect(plan2.formatChecks).toHaveLength(1);
    expect(emitValidValues(ir2)).toContain('email: "tim@example.com"');
  });

  it("the component spec asserts the array minimum on blank submit and emits bound probes", () => {
    const source = emitComponentSpec({
      runner: "vitest",
      formName: "BoundedForm",
      schemaImport: { name: "boundedSchema", from: "./boundedSchema", kind: "named" },
      ir,
      plan,
      componentImport: "./BoundedForm",
      skipRender: false,
      asyncSchema: false,
      optionsProps: [],
    });
    expect(source).toContain('expect(result.errors["tags"]).toBeDefined();');
    expect(source).toContain('expect(result.errors["maybeTags"]).toBeDefined();');
    expect(source).toContain('it("Name rejects a value shorter than 3 characters", async () => {');
    expect(source).toContain('fillAndBlurField(form, "name", "xx");');
    expect(source).toContain('fillAndBlurField(form, "name", "filled");');
    expect(source).toContain('it("Age rejects a value below 18", async () => {');
    // Number probes fill the store with numbers, not strings.
    expect(source).toContain('fillAndBlurField(form, "age", 17);');
    expect(source).toContain('fillAndBlurField(form, "age", 18);');
    expect(source).toContain('it("Count rejects a value that is not an integer", async () => {');
    expect(source).toContain('import { fillAndBlurField, submitForm } from "formstand/testing";');
  });

  it("bound probes alone pull the fill helper into the imports", () => {
    const ir2 = fromZod(z.object({ name: z.string().max(4) }));
    const source = emitComponentSpec({
      runner: "vitest",
      formName: "OnlyMaxForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
      ir: ir2,
      plan: collectTestPlan(ir2),
      componentImport: "./OnlyMaxForm",
      skipRender: false,
      asyncSchema: false,
      optionsProps: [],
    });
    expect(source).toContain('import { fillAndBlurField, submitForm } from "formstand/testing";');
    expect(source).not.toContain("a blank submit reports");
  });
});
