import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main, moduleSpecifier } from "../src/cli";
import {
  FORMSTAND_PATH_DEPTH,
  depthWarningFrontier,
  emitPlainForm,
  emitZodSchema,
  overBudgetFieldPaths,
  truncatedFieldPaths,
} from "../src/codegen";
import { emitModuleForm } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import { applyFieldOverrides } from "../src/overrides";
import { collectTestPlan } from "../src/testCases";
import { emitComponentSpec } from "../src/testsEmit";
import { fixturesDir, freshTmpDir, typecheckDiagnostics } from "./helpers";
import { deepPathsSchema } from "./fixtures/deepPathsSchema";
import { deeperPathsSchema } from "./fixtures/deeperPathsSchema";
import { deepRowsSchema } from "./fixtures/deepRowsSchema";

// --path-depth: the typed-path budget as a per-run VALUE. Every depth
// boundary the emitters draw (both layouts, the warnings, the override
// validator, the generated spec) moves with it, and the emitted form sets
// createForm's `pathDepth` to the same number so the library's FieldPath
// union agrees with the generator. The proof that nothing still reads the
// default constant: output generated at a NARROWED budget typechecks (a
// leaked in-budget binding past `pathDepth: 5` would fail TS2820), and
// output at a WIDENED budget carries no depth TODO at all.

const DEEP_LEAVES = [
  "l1.l2.l3.l4.l5.l6.l7.l8.l9.leaf",
  "l1.l2.l3.l4.l5.l6.l7.l8.l9.count",
] as const;

const schemaImportFor = (dir: string, schemaName: string) => ({
  name: schemaName,
  from: moduleSpecifier(dir, path.join(fixturesDir, `${schemaName}.ts`)),
  kind: "named" as const,
});

const captureStderr = async <T>(
  run: () => Promise<T>,
): Promise<Readonly<{ result: T; stderr: string }>> => {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(((chunk: unknown): boolean => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
  try {
    const result = await run();
    return { result, stderr: chunks.join("") };
  } finally {
    spy.mockRestore();
  }
};

describe("--path-depth parsing", () => {
  const input = path.join(fixturesDir, "deepPathsSchema.ts");

  it.each([
    ["0", "from 1 to 25"],
    ["26", "from 1 to 25"],
    ["abc", "from 1 to 25"],
    ["-3", "from 1 to 25"],
  ])("refuses %s", async (value, expected) => {
    const { result, stderr } = await captureStderr(() =>
      main([input, "--path-depth", value]),
    );
    expect(result).toBe(1);
    expect(stderr).toContain("--path-depth must be an integer");
    expect(stderr).toContain(expected);
  });

  it("refuses a missing value", async () => {
    const { result, stderr } = await captureStderr(() =>
      main([input, "--path-depth"]),
    );
    expect(result).toBe(1);
    expect(stderr).toContain("missing value for --path-depth");
  });
});

describe("a widened budget binds what the default degrades", () => {
  it("single-file: no depth TODO, pathDepth in useForm, and it typechecks", () => {
    const dir = freshTmpDir("path-depth-single-wide");
    const code = emitPlainForm({
      ir: fromZod(deepPathsSchema),
      formName: "WideForm",
      schemaImport: schemaImportFor(dir, "deepPathsSchema"),
      pathDepth: 12,
    });
    const file = path.join(dir, "WideForm.tsx");
    fs.writeFileSync(file, code, "utf8");
    expect(code).not.toContain("TODO: path");
    expect(code).toContain(
      'useForm(deepPathsSchema, { initialValues, mode: "onBlur", pathDepth: 12 })',
    );
    for (const leaf of DEEP_LEAVES) {
      expect(code).toContain(`path={${JSON.stringify(leaf)}}`);
    }
    expect(typecheckDiagnostics([file])).toEqual([]);
  });

  it("nested Rows components carry the depth argument on their form prop", () => {
    const dir = freshTmpDir("path-depth-rows-wide");
    const ir = fromZod(deepRowsSchema, 14);
    const code = emitPlainForm({
      ir,
      formName: "WideRowsForm",
      schemaImport: schemaImportFor(dir, "deepRowsSchema"),
      pathDepth: 12,
    });
    const file = path.join(dir, "WideRowsForm.tsx");
    fs.writeFileSync(file, code, "utf8");
    // The 11-segment row paths (see the fixture's table) all bind now.
    expect(code).not.toContain("TODO: path");
    expect(code).toContain("form: Form<typeof deepRowsSchema, 12>");
    expect(code).not.toContain("form: Form<typeof deepRowsSchema>");
    expect(overBudgetFieldPaths(ir, depthWarningFrontier("single"), 12)).toEqual(
      [],
    );
    expect(typecheckDiagnostics([file])).toEqual([]);
  });

  it("module layout: hooks.ts sets pathDepth, no section degrades, all files typecheck", () => {
    const dir = freshTmpDir("path-depth-module-wide");
    const ir = fromZod(deepRowsSchema, 14);
    const files = emitModuleForm({
      ir,
      formName: "WideModuleForm",
      ui: "plain",
      schemaImport: { name: "deepRowsSchema", from: "./external", kind: "named" },
      schemaSource: emitZodSchema(ir, "deepRowsSchema"),
      pathDepth: 12,
    });
    const written = files.map((file) => {
      const dest = path.join(dir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });
    const hooks = files.find((file) => file.path.endsWith("hooks.ts"));
    expect(hooks?.content).toContain("  pathDepth: 12,");
    expect(files.some((file) => file.content.includes("TODO: path"))).toBe(false);
    expect(overBudgetFieldPaths(ir, depthWarningFrontier("module"), 12)).toEqual(
      [],
    );
    expect(typecheckDiagnostics(written)).toEqual([]);
  });

  it("--form-prop types the prop and the owner hook at the widened depth", () => {
    const code = emitPlainForm({
      ir: fromZod(deepPathsSchema),
      formName: "WidePropForm",
      schemaImport: { name: "deepPathsSchema", from: "./deepPathsSchema", kind: "named" },
      pathDepth: 12,
      formProp: true,
    });
    expect(code).toContain("  form: Form<typeof deepPathsSchema, 12>;");
    expect(code).toContain(
      'useForm(deepPathsSchema, { initialValues, mode: "onBlur", pathDepth: 12 })',
    );
  });

  it("the generated spec's own createForm widens the same way", () => {
    const ir = fromZod(deepPathsSchema);
    const spec = emitComponentSpec({
      runner: "vitest",
      formName: "WideForm",
      schemaImport: { name: "deepPathsSchema", from: "./deepPathsSchema", kind: "named" },
      ir,
      plan: collectTestPlan(ir),
      componentImport: "./WideForm",
      skipRender: false,
      asyncSchema: false,
      optionsProps: [],
      pathDepth: 12,
    });
    expect(spec).toContain(
      "createForm(deepPathsSchema, { initialValues: blankValues, pathDepth: 12 })",
    );
  });

  it("at the library default nothing changes in the output", () => {
    const options = {
      ir: fromZod(deepPathsSchema),
      formName: "DefaultForm",
      schemaImport: { name: "deepPathsSchema", from: "./deepPathsSchema", kind: "named" as const },
    };
    expect(emitPlainForm({ ...options, pathDepth: FORMSTAND_PATH_DEPTH })).toBe(
      emitPlainForm(options),
    );
    expect(emitPlainForm(options)).not.toContain("pathDepth");
  });
});

describe("a narrowed budget degrades more, and the output still typechecks", () => {
  it("single-file: TODOs name the budget, warnings mirror them, pathDepth: 5 compiles", () => {
    const dir = freshTmpDir("path-depth-single-narrow");
    const ir = fromZod(deepPathsSchema);
    const code = emitPlainForm({
      ir,
      formName: "NarrowForm",
      schemaImport: schemaImportFor(dir, "deepPathsSchema"),
      pathDepth: 5,
    });
    const file = path.join(dir, "NarrowForm.tsx");
    fs.writeFileSync(file, code, "utf8");
    // An object at 5 segments binds its children at 6, past the budget:
    // one TODO at the container, and the at-the-limit branch degrades too.
    const expected = ["l1.l2.l3.l4.l5", "a.b.c.d.e"];
    for (const todoPath of expected) {
      expect(code).toContain(
        `{/* TODO: path "${todoPath}" exceeds formstand's typed FieldPath depth (5); bind by hand */}`,
      );
    }
    expect(overBudgetFieldPaths(ir, depthWarningFrontier("single"), 5)).toEqual(
      expected,
    );
    expect(code).toContain("pathDepth: 5");
    // The library's union really is 5 segments wide here, so any binding
    // the emitters wrongly kept past it would fail this typecheck.
    expect(typecheckDiagnostics([file])).toEqual([]);
  });

  it("module layout at 5 typechecks with the same TODO set", () => {
    const dir = freshTmpDir("path-depth-module-narrow");
    const ir = fromZod(deepPathsSchema);
    const files = emitModuleForm({
      ir,
      formName: "NarrowModuleForm",
      ui: "plain",
      schemaImport: { name: "deepPathsSchema", from: "./external", kind: "named" },
      schemaSource: emitZodSchema(ir, "deepPathsSchema"),
      pathDepth: 5,
    });
    const written = files.map((file) => {
      const dest = path.join(dir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });
    const todos = files.flatMap((file) =>
      [...file.content.matchAll(/TODO: path "([^"]+)" exceeds formstand's typed FieldPath depth \(5\)/g)].map(
        (match) => match[1],
      ),
    );
    expect([...todos].sort()).toEqual(
      [...overBudgetFieldPaths(ir, depthWarningFrontier("module"), 5)].sort(),
    );
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});

describe("the CLI threads --path-depth everywhere", () => {
  it("widens the walker budget too: an 11-segment leaf is walked, not truncated", async () => {
    const dir = freshTmpDir("path-depth-cli-wide");
    const out = path.join(dir, "DeeperForm.tsx");
    // deeperPathsSchema's leaf sits one past the DEFAULT derived walker
    // budget (11); with --path-depth 12 and no --max-depth the walker
    // budget derives as 14, so the leaf keeps its real kind (nullable
    // number → blanks to null, no cast, no truncation warning).
    expect(truncatedFieldPaths(fromZod(deeperPathsSchema))).toHaveLength(1);
    const { result, stderr } = await captureStderr(() =>
      main([
        path.join(fixturesDir, "deeperPathsSchema.ts"),
        "--out",
        out,
        "--path-depth",
        "12",
      ]),
    );
    expect(result).toBe(0);
    expect(stderr).not.toContain("exceeds the walker nesting budget");
    expect(stderr).not.toContain("exceeds formstand's typed FieldPath depth");
    const code = fs.readFileSync(out, "utf8");
    expect(code).not.toContain("nesting depth limit reached");
    expect(code).toContain("count: null,");
    expect(code).toContain("pathDepth: 12");
    expect(typecheckDiagnostics([out])).toEqual([]);
  });

  it("narrowing prints one warning per TODO, naming the budget and the flag", async () => {
    const dir = freshTmpDir("path-depth-cli-narrow");
    const out = path.join(dir, "NarrowForm.tsx");
    const { result, stderr } = await captureStderr(() =>
      main([
        path.join(fixturesDir, "deepPathsSchema.ts"),
        "--out",
        out,
        "--path-depth",
        "5",
      ]),
    );
    expect(result).toBe(0);
    for (const todoPath of ["l1.l2.l3.l4.l5", "a.b.c.d.e"]) {
      expect(stderr).toContain(
        `warning: path "${todoPath}" exceeds formstand's typed FieldPath depth (5); emitted a TODO — raise --path-depth or bind it by hand`,
      );
    }
  });

  it("an override past the default budget is accepted once the budget covers it", () => {
    const ir = fromZod(deepPathsSchema);
    const overrides = { [DEEP_LEAVES[0]]: { component: "textarea" as const } };
    expect(() => applyFieldOverrides(ir, overrides)).toThrow(
      /typed FieldPath depth \(9\).*raise --path-depth/s,
    );
    const stamped = applyFieldOverrides(ir, overrides, "single", 1, 12);
    expect(JSON.stringify(stamped)).toContain('"component":"textarea"');
  });

  it("the spec emitted beside the component carries the budget", async () => {
    const dir = freshTmpDir("path-depth-cli-tests");
    const out = path.join(dir, "WideForm.tsx");
    const { result } = await captureStderr(() =>
      main([
        path.join(fixturesDir, "deepPathsSchema.ts"),
        "--out",
        out,
        "--path-depth",
        "12",
        "--tests",
        "vitest",
      ]),
    );
    expect(result).toBe(0);
    // The spec is named after the FORM (derived from the schema export),
    // not the --out basename.
    const spec = fs.readFileSync(path.join(dir, "DeepPathsForm.test.tsx"), "utf8");
    expect(spec).toContain("pathDepth: 12");
  });
});

describe("a hand-built IR at a custom budget", () => {
  it("collectOptionsProps honors the budget it is given", () => {
    // A textarea override 10 segments deep: invisible at the default
    // budget (the leaf is a TODO there), collected at 12.
    const ir = applyFieldOverrides(
      fromZod(deepPathsSchema),
      { [DEEP_LEAVES[0]]: { component: "autocomplete" as const, optionsProp: true } },
      "single",
      1,
      12,
    );
    const wide = emitPlainForm({
      ir,
      formName: "OptionsForm",
      schemaImport: { name: "deepPathsSchema", from: "./deepPathsSchema", kind: "named" },
      pathDepth: 12,
    });
    expect(wide).toContain("l1L2L3L4L5L6L7L8L9LeafOptions: readonly string[]");
  });
});
