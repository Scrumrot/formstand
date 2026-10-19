import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { main } from "../src/cli";
import { blankNeedsCast, emitInitialValues } from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { collectTestPlan } from "../src/testCases";
import { emitComponentSpec } from "../src/testsEmit";
import {
  fixturesDir,
  freshTmpDir,
  muiStubPaths,
  typecheckDiagnostics,
} from "./helpers";
import { optionalObjectSchema } from "./fixtures/optionalObjectSchema";

// An optional/nullable object used to be seeded populated (`billing:
// { street: "", zip: "", amount: undefined }`), so a blank form carried a
// billing object nobody filled and zod rejected its required members on
// every submit: the form could not submit blank at all. It now starts
// undefined/null, like an optional union, and the generated-tests plan
// stops promising blank-submit errors under it (zod never checks the
// members of an absent parent).

const fixture = path.join(fixturesDir, "optionalObjectSchema.ts");
const ir = fromZod(optionalObjectSchema);

const listFiles = (dir: string): readonly string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? listFiles(path.join(dir, entry.name))
        : [path.join(dir, entry.name)],
    );

describe("optional object seeding", () => {
  it("an optional object starts undefined and a nullable one null", () => {
    const literal = emitInitialValues(ir, 0);
    expect(literal).toContain("billing: undefined,");
    expect(literal).toContain("shipping: null,");
    // The required sibling is still materialized so its fields bind.
    expect(literal).toContain('contact: {\n    email: "",\n  },');
    expect(literal).not.toContain("street");
  });

  it("the absent sections never force the initialValues cast", () => {
    // billing.amount and shipping.weight are required numbers, which would
    // force the cast if their parents were seeded; undefined/null satisfy
    // z.input on their own, so only the blank form's OTHER leaves decide.
    expect(blankNeedsCast(ir)).toBe(false);
    expect(
      blankNeedsCast(
        fromZod(z.object({ box: z.object({ n: z.number() }) })),
      ),
    ).toBe(true);
  });

  it("the blank-submit plan omits paths under an optional or nullable object", () => {
    const plan = collectTestPlan(ir);
    expect(plan.requiredPaths.map((entry) => entry.path)).toEqual([
      "contact.email",
    ]);
    // Bound probes under it stay: a fill materializes the parent first.
    expect(plan.boundChecks.map((entry) => entry.path)).toEqual(["billing.zip"]);
    const spec = emitComponentSpec({
      runner: "vitest",
      formName: "OptionalForm",
      schemaImport: { name: "optionalObjectSchema", from: "./optionalObjectSchema", kind: "named" },
      ir,
      plan,
      componentImport: "./OptionalForm",
      skipRender: false,
      asyncSchema: false,
      optionsProps: [],
    });
    expect(spec).toContain('expect(result.errors["contact.email"]).toBeDefined();');
    expect(spec).not.toContain('result.errors["billing.');
    expect(spec).not.toContain('result.errors["shipping.');
    // The valid literal still fills the optional object (it parses).
    expect(plan.validValues).toContain("billing: {");
    const values: unknown = new Function(`return ${plan.validValues};`)();
    expect(optionalObjectSchema.safeParse(values).success).toBe(true);
  });

  // One case per layout: each typecheck builds a real ts.createProgram
  // against the library source (about 2.5 s each alone), and the three
  // together overran the 30 s test budget whenever the suite's other
  // typecheck files ran alongside, so the combined case timed out under
  // load while passing in isolation.
  it("plain output typechecks with the empty seeds", async () => {
    const plainDir = freshTmpDir("optional-object-plain");
    const plainOut = path.join(plainDir, "OptionalForm.tsx");
    expect(await main([fixture, "--out", plainOut])).toBe(0);
    expect(typecheckDiagnostics([plainOut])).toEqual([]);
  });

  it("mui output typechecks with the empty seeds", async () => {
    const muiDir = freshTmpDir("optional-object-mui");
    const muiOut = path.join(muiDir, "OptionalForm.tsx");
    expect(await main([fixture, "--ui", "mui", "--out", muiOut])).toBe(0);
    expect(typecheckDiagnostics([muiOut], muiStubPaths)).toEqual([]);
  });

  it("module output seeds the absent sections and typechecks", async () => {
    const moduleDir = freshTmpDir("optional-object-module");
    expect(await main([fixture, "--layout", "module", "--out", moduleDir])).toBe(0);
    const hooks = fs.readFileSync(path.join(moduleDir, "hooks.ts"), "utf8");
    expect(hooks).toContain("billing: undefined,");
    expect(hooks).toContain("shipping: null,");
    expect(typecheckDiagnostics(listFiles(moduleDir))).toEqual([]);
  });
});
