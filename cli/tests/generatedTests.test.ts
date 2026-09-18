import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fromZod } from "../src/fromZod";
import { collectTestPlan, emitValidValues } from "../src/testCases";
import { emitComponentSpec, emitPlaywrightSpec } from "../src/testsEmit";
import { main } from "../src/cli";
import fs from "node:fs";
import path from "node:path";
import { freshTmpDir } from "./helpers";

// Generated tests (--tests; design: cli/design/generated-tests.md). The
// EXECUTION proof lives in the root suite (tests/generatedSpec.test.tsx
// imports an emitted spec so its cases run against the library source);
// these tests pin the plan derivation, the emitted shapes, the honest
// degradations, and the CLI wiring.

const schema = z.object({
  email: z.email(),
  quantity: z.number(),
  tier: z.enum(["basic", "pro"]),
  notes: z.string().optional(),
  agreed: z.boolean(),
  shipping: z.object({ city: z.string() }),
});

const ir = fromZod(schema);
const plan = collectTestPlan(ir);
const schemaImport = {
  name: "orderSchema",
  from: "./orderSchema",
  kind: "named",
} as const;

const spec = (
  overrides: Partial<Parameters<typeof emitComponentSpec>[0]> = {},
): string =>
  emitComponentSpec({
    runner: "vitest",
    formName: "OrderForm",
    schemaImport,
    ir,
    plan,
    componentImport: "./OrderForm",
    skipRender: false,
    asyncSchema: false,
    optionsProps: [],
    ...overrides,
  });

describe("the test plan derives only what the IR carries", () => {
  it("blank-invalid means numbers, dates, enums, and formatted strings", () => {
    expect(plan.requiredPaths.map((entry) => entry.path)).toEqual([
      "email",
      "quantity",
      "tier",
    ]);
    // A bare required string accepts the seeded "", a boolean accepts
    // false, and optionals never gate — none of them is a case.
  });

  it("format checks carry rejecting and passing samples", () => {
    expect(plan.formatChecks).toEqual([
      {
        path: "email",
        label: "Email",
        format: "email",
        bad: "not-an-email",
        good: "tim@example.com",
      },
    ]);
  });

  it("the valid literal parses through the schema it was derived from", () => {
    const literal = new Function(`return ${emitValidValues(ir)};`)() as unknown;
    expect(schema.safeParse(literal).success).toBe(true);
  });
});

describe("the component spec", () => {
  it("asserts presence at every blank-invalid path and round-trips schema.parse", () => {
    const code = spec();
    expect(code).toContain(`expect(result.errors["email"]).toBeDefined();`);
    expect(code).toContain(`expect(result.errors["quantity"]).toBeDefined();`);
    expect(code).toContain(
      "expect(result.data).toEqual(orderSchema.parse(validValues));",
    );
    expect(code).toContain(`fillAndBlurField(form, "email", "not-an-email");`);
  });

  it("jest flavor is the same body without the vitest globals import", () => {
    const jest = spec({ runner: "jest" });
    expect(jest).not.toContain(`from "vitest"`);
    expect(jest).toContain("a blank submit reports the fields");
  });

  it("an async schema skips submit cases with the stub seam named", () => {
    const code = spec({ asyncSchema: true });
    expect(code).toContain("it.skip(");
    expect(code).toContain("stub its");
    expect(code).toContain("await form.validateFieldsAsync(");
  });

  it("skipRender emits the render cases as it.skip with the reason", () => {
    const code = spec({
      skipRender: true,
      skipRenderReason: "kit output renders inside its provider",
    });
    expect(code).toContain("// kit output renders inside its provider");
    expect(code).toContain(
      `it.skip("a blank submit marks the first blank-invalid control"`,
    );
  });

  it("a configured renderWrapper wraps the render", () => {
    const code = spec({ renderWrapper: "../test/renderWithProviders" });
    expect(code).toContain(
      `import { RenderWrapper } from "../test/renderWithProviders";`,
    );
    expect(code).toContain("{ wrapper: RenderWrapper }");
  });
});

describe("the playwright spec", () => {
  it("drives by role and label against the configured base", () => {
    const code = emitPlaywrightSpec({
      formName: "OrderForm",
      plan,
      baseURL: "http://localhost:5173",
      route: "/order",
    });
    expect(code).toContain(`test.use({ baseURL: "http://localhost:5173" });`);
    expect(code).toContain(`await page.goto("/order");`);
    expect(code).toContain(
      `page.getByRole("button", { name: /submit/i }).click();`,
    );
    expect(code).toContain(`page.getByLabel("Email")`);
  });
});

describe("the CLI wiring", () => {
  const writeSchema = (dir: string): string => {
    const file = path.join(dir, "orderSchema.ts");
    fs.writeFileSync(
      file,
      `import { z } from "zod";\nexport const orderSchema = z.object({ email: z.email(), quantity: z.number() });\n`,
      "utf8",
    );
    return file;
  };

  it("--tests vitest writes the spec beside the component", async () => {
    const dir = freshTmpDir("gen-tests-single");
    const input = writeSchema(dir);
    const out = path.join(dir, "OrderForm.tsx");
    expect(
      await main([input, "--export", "orderSchema", "--tests", "vitest", "--out", out]),
    ).toBe(0);
    const specPath = path.join(dir, "OrderForm.test.tsx");
    expect(fs.existsSync(specPath)).toBe(true);
    expect(fs.readFileSync(specPath, "utf8")).toContain(
      `import { OrderForm } from "./OrderForm";`,
    );
  });

  it("--tests without --out is a loud error", async () => {
    const dir = freshTmpDir("gen-tests-noout");
    const input = writeSchema(dir);
    expect(await main([input, "--export", "orderSchema", "--tests", "vitest"])).toBe(1);
  });

  it("--tests vitest,jest is a loud error (same spec, different globals)", async () => {
    const dir = freshTmpDir("gen-tests-both");
    const input = writeSchema(dir);
    expect(
      await main([
        input,
        "--export",
        "orderSchema",
        "--tests",
        "vitest,jest",
        "--out",
        path.join(dir, "OrderForm.tsx"),
      ]),
    ).toBe(1);
  });

  it("an unknown runner is a parse error", async () => {
    const dir = freshTmpDir("gen-tests-unknown");
    const input = writeSchema(dir);
    expect(
      await main([
        input,
        "--tests",
        "mocha",
        "--out",
        path.join(dir, "OrderForm.tsx"),
      ]),
    ).toBe(1);
  });

  it("playwright without a configured baseURL is skipped with a note, not emitted", async () => {
    const dir = freshTmpDir("gen-tests-pw");
    const input = writeSchema(dir);
    const out = path.join(dir, "OrderForm.tsx");
    expect(
      await main([
        input,
        "--export",
        "orderSchema",
        "--tests",
        "playwright",
        "--out",
        out,
      ]),
    ).toBe(0);
    expect(fs.existsSync(path.join(dir, "OrderForm.e2e.ts"))).toBe(false);
  });

  it("the module layout writes the spec into the module folder", async () => {
    const dir = freshTmpDir("gen-tests-module");
    const input = writeSchema(dir);
    const out = path.join(dir, "order-module");
    expect(
      await main([
        input,
        "--export",
        "orderSchema",
        "--layout",
        "module",
        "--tests",
        "vitest",
        "--out",
        out,
      ]),
    ).toBe(0);
    expect(fs.existsSync(path.join(out, "OrderForm.test.tsx"))).toBe(true);
  });
});
