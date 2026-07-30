import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { main, moduleSpecifier } from "../src/cli";
import {
  type EmitFormOptions,
  FORMSTAND_PATH_DEPTH,
  depthWarningFrontier,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
  emitZodSchema,
  overBudgetFieldPaths,
  pathSegmentCount,
  truncatedFieldPaths,
} from "../src/codegen";
import { emitModuleForm, joinModuleFiles } from "../src/moduleLayout";
import { DEFAULT_MAX_DEPTH, fromZod } from "../src/fromZod";
import {
  fixturesDir,
  freshTmpDir,
  muiStubPaths,
  shadcnStubFile,
  typecheckDiagnostics,
} from "./helpers";
import { deepPathsSchema } from "./fixtures/deepPathsSchema";
import { deeperPathsSchema } from "./fixtures/deeperPathsSchema";
import { deepRowsSchema } from "./fixtures/deepRowsSchema";

// formstand's FieldPath union stops at 9 segments by default
// (src/core/fieldPath.ts, D=9 — the CLI follows the library default); a
// binding past that fails typecheck (TS2820). The emitters must degrade
// such bindings to a TODO — counted on the FULL bound path, where an array
// level spends TWO segments — while paths exactly AT the limit keep
// binding. These suites pin both sides of the boundary and prove every
// degraded output still typechecks against the real library source.

// deepRowsSchema nests past even the derived default walker budget
// (FORMSTAND_PATH_DEPTH + 2 = 11), so these suites pass an explicit budget
// — the PATH budget must be the only thing degrading. The default-flags
// behavior (no override at all) gets its own suite below.
const FIXTURE_MAX_DEPTH = 12;

const DEPTH_TODO = `exceeds formstand's typed FieldPath depth (${FORMSTAND_PATH_DEPTH}); bind by hand`;

type Emitter = (options: EmitFormOptions) => string;

// Generate a single-file component in `dir` bound to a named fixture schema
// (same shape as typecheck.test.ts's helper).
const generate = (
  emit: Emitter,
  schema: unknown,
  schemaName: string,
  formName: string,
  dir: string,
): Readonly<{ file: string; code: string }> => {
  const code = emit({
    ir: fromZod(schema, FIXTURE_MAX_DEPTH),
    formName,
    schemaImport: {
      name: schemaName,
      from: moduleSpecifier(dir, path.join(fixturesDir, `${schemaName}.ts`)),
      kind: "named",
    },
  });
  const file = path.join(dir, `${formName}.tsx`);
  fs.writeFileSync(file, code, "utf8");
  return { file, code };
};

// Emit a module in type mode (generated schema source — no fixture file
// needed on disk) and write every file (same shape as nestedArrays.test.ts).
const generateModule = (
  schema: unknown,
  schemaName: string,
  formName: string,
  dir: string,
) => {
  const ir = fromZod(schema, FIXTURE_MAX_DEPTH);
  const files = emitModuleForm({
    ir,
    formName,
    ui: "plain",
    schemaImport: { name: schemaName, from: "./external", kind: "named" },
    schemaSource: emitZodSchema(ir, schemaName),
  });
  const written = files.map((file) => {
    const dest = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    return dest;
  });
  return { files, written };
};

describe("pathSegmentCount", () => {
  it("splits on dots with template holes one segment each", () => {
    expect(pathSegmentCount("title")).toBe(1);
    expect(pathSegmentCount("l1.l2.l3.l4.l5.l6.l7.l8.l9.leaf")).toBe(10);
    expect(pathSegmentCount("teams.${p0}.members.${p1}.phones.${index}")).toBe(6);
  });

  // The hole pattern is a library entry point (formstand-cli/codegen runs the
  // emitters in the browser), so an unterminated "${" run must not rescan to
  // end-of-string from every start. With [^}] this input is quadratic and
  // takes seconds; with [^{}] it is flat. Generous ceiling: the point is
  // linear vs quadratic, not a millisecond budget on a shared runner.
  it("stays linear on unterminated template holes", () => {
    const evil = "${{".repeat(40_000);
    const started = performance.now();
    expect(pathSegmentCount(evil)).toBe(1);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe("overBudgetFieldPaths", () => {
  it("reports the boundary node once per emitted TODO site", () => {
    // The recursion stops at l9 (its own path is AT the budget, so every
    // child can only exceed it); the at-limit branch and shallow fields are
    // clean.
    expect(
      overBudgetFieldPaths(fromZod(deepPathsSchema, FIXTURE_MAX_DEPTH)),
    ).toEqual(["l1.l2.l3.l4.l5.l6.l7.l8.l9"]);
  });

  it("counts array levels as two segments (`*` marks the row index)", () => {
    // One entry PER EMITTED TODO: the scalar rows of `d` degrade at the row
    // path, while `e`'s OBJECT rows degrade per field (`f`, `g`) — exactly
    // the TODO lines the emission tests below pin.
    expect(
      overBudgetFieldPaths(fromZod(deepRowsSchema, FIXTURE_MAX_DEPTH)),
    ).toEqual([
      "a.*.b.*.c.*.h.*.d.*",
      "a.*.b.*.c.*.h.*.e.*.f",
      "a.*.b.*.c.*.h.*.e.*.g",
    ]);
  });

  it("stays empty within the budget", () => {
    expect(
      overBudgetFieldPaths(
        fromZod(z.object({ a: z.array(z.object({ b: z.string() })) })),
      ),
    ).toEqual([]);
  });
});

describe("depth budget in the single-file layout", () => {
  const dir = freshTmpDir("depth-single");
  const plain = generate(
    emitPlainForm,
    deepPathsSchema,
    "deepPathsSchema",
    "DeepPathsForm",
    dir,
  );
  const rows = generate(
    emitPlainForm,
    deepRowsSchema,
    "deepRowsSchema",
    "DeepRowsForm",
    dir,
  );

  it("degrades the over-budget subtree to a TODO and keeps binding at the limit", () => {
    // The TODO lands at l9 — the first node whose children can only exceed
    // the budget — and no 10+-segment path is ever bound.
    expect(plain.code).toContain(
      `{/* TODO: path "l1.l2.l3.l4.l5.l6.l7.l8.l9" ${DEPTH_TODO} */}`,
    );
    expect(plain.code).not.toContain("l1.l2.l3.l4.l5.l6.l7.l8.l9.leaf");
    // Exactly 9 segments still binds normally...
    expect(plain.code).toContain('path={"a.b.c.d.e.f.g.h.i"}');
    // ...and so do shallow fields.
    expect(plain.code).toContain('path={"title"}');
  });

  it("still materializes the over-budget subtree in initialValues", () => {
    // Like unaddressable keys: no binding, but the draft keeps the shape.
    expect(plain.code).toContain("l9: {");
    expect(plain.code).toContain('leaf: "",');
    expect(plain.code).toContain("count: null,");
  });

  it("counts a row leaf's full template path (arrays spend two segments)", () => {
    // 9-segment row field: binds.
    expect(rows.code).toContain(
      "path={`a.${p0}.b.${p1}.c.${p2}.h.${index}.name`}",
    );
    // 9-segment list: the hook binds, its 10-segment scalar rows degrade.
    expect(rows.code).toContain(
      "useFieldArray(form, `a.${p0}.b.${p1}.c.${p2}.h.${p3}.d`);",
    );
    expect(rows.code).toContain(
      `{/* TODO: path "a.\${p0}.b.\${p1}.c.\${p2}.h.\${p3}.d.\${index}" ${DEPTH_TODO} */}`,
    );
    // 11-segment row field / nested list: TODO, and no over-budget hook.
    expect(rows.code).toContain(
      `{/* TODO: path "a.\${p0}.b.\${p1}.c.\${p2}.h.\${p3}.e.\${index}.f" ${DEPTH_TODO} */}`,
    );
    expect(rows.code).toContain(
      `{/* TODO: path "a.\${p0}.b.\${p1}.c.\${p2}.h.\${p3}.e.\${index}.g" ${DEPTH_TODO} */}`,
    );
    expect(rows.code).not.toContain(".e.${p4}");
  });

  // THE BIG ONE for this bug: the degraded outputs must typecheck against
  // the real library source in every backend — the exact failure mode that
  // shipped as examples/src/generated/DeepBoundaryForm.tsx (TS2820).
  it("plain over-budget outputs typecheck", () => {
    expect(typecheckDiagnostics([plain.file, rows.file])).toEqual([]);
  });

  it("mui over-budget outputs typecheck", () => {
    const muiDir = freshTmpDir("depth-single-mui");
    const files = [
      generate(emitMuiForm, deepPathsSchema, "deepPathsSchema", "DeepPathsForm", muiDir).file,
      generate(emitMuiForm, deepRowsSchema, "deepRowsSchema", "DeepRowsForm", muiDir).file,
    ];
    expect(typecheckDiagnostics(files, muiStubPaths)).toEqual([]);
  });

  it("shadcn over-budget outputs typecheck", () => {
    const shadcnDir = freshTmpDir("depth-single-shadcn");
    const files = [
      generate(emitShadcnForm, deepPathsSchema, "deepPathsSchema", "DeepPathsForm", shadcnDir).file,
      generate(emitShadcnForm, deepRowsSchema, "deepRowsSchema", "DeepRowsForm", shadcnDir).file,
    ];
    expect(typecheckDiagnostics([...files, shadcnStubFile])).toEqual([]);
  });
});

describe("depth budget in the module layout", () => {
  const dir = freshTmpDir("depth-module");
  const deep = generateModule(deepPathsSchema, "deepPathsSchema", "DeepForm", dir);
  const rowsDir = freshTmpDir("depth-module-rows");
  const rows = generateModule(deepRowsSchema, "deepRowsSchema", "RowsForm", rowsDir);

  it("degrades over-budget leaves to a section TODO and plans no field file", () => {
    const section = deep.files.find(
      (f) => f.path === "sections/L1Section.tsx",
    );
    expect(section?.content).toContain(
      `{/* TODO: path "l1.l2.l3.l4.l5.l6.l7.l8.l9" ${DEPTH_TODO} */}`,
    );
    // No field file reaches under the TODO'd subtree...
    expect(deep.files.some((f) => f.path === "fields/LeafField.tsx")).toBe(false);
    expect(deep.files.some((f) => f.path === "fields/CountField.tsx")).toBe(false);
    // ...while the at-the-limit leaf gets its normal bound field file.
    const i = deep.files.find((f) => f.path === "fields/IField.tsx");
    expect(i?.content).toContain('useDeepField("a.b.c.d.e.f.g.h.i")');
  });

  it("degrades over-budget row bindings, keeping in-budget extraction", () => {
    const section = rows.files.find((f) => f.path === "sections/ASection.tsx");
    // 9-segment row field binds; the at-limit list hook binds.
    expect(section?.content).toContain(
      "useRowsField(`a.${p0}.b.${p1}.c.${p2}.h.${index}.name`);",
    );
    expect(section?.content).toContain(
      "useRowsFieldArray(`a.${p0}.b.${p1}.c.${p2}.h.${p3}.d`);",
    );
    // 10-segment scalar rows and 11-segment row fields degrade to TODOs.
    expect(section?.content).toContain(
      `{/* TODO: path "a.\${p0}.b.\${p1}.c.\${p2}.h.\${p3}.d.\${index}" ${DEPTH_TODO} */}`,
    );
    expect(section?.content).toContain(
      `{/* TODO: path "a.\${p0}.b.\${p1}.c.\${p2}.h.\${p3}.e.\${index}.f" ${DEPTH_TODO} */}`,
    );
    expect(section?.content).toContain(
      `{/* TODO: path "a.\${p0}.b.\${p1}.c.\${p2}.h.\${p3}.e.\${index}.g" ${DEPTH_TODO} */}`,
    );
    expect(section?.content).not.toContain(".e.${p4}");
  });

  it("both degraded modules typecheck against the library source", () => {
    expect(typecheckDiagnostics(deep.written)).toEqual([]);
    expect(typecheckDiagnostics(rows.written)).toEqual([]);
  });
});

describe("at-budget arrays with non-scalar items", () => {
  // Eight object levels put `list` at exactly 9 segments: the list hook
  // still binds, but every row path sits at 10 — extraction (or any hand
  // binding) is impossible within the budget, so the emitters must say so
  // with the DEPTH todo (not the generic extract-a-row advice), and the
  // warning list must match the emitted TODOs one for one.
  const atBudgetList = (item: z.ZodType): z.ZodType =>
    z.object({
      o1: z.object({
        o2: z.object({
          o3: z.object({
            o4: z.object({
              o5: z.object({
                o6: z.object({
                  o7: z.object({ o8: z.object({ list: z.array(item) }) }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
  const LIST = "o1.o2.o3.o4.o5.o6.o7.o8.list";
  const depthTodoCount = (code: string): number =>
    (code.match(/exceeds formstand's typed FieldPath depth/g) ?? []).length;

  it("array-of-arrays rows emit the depth TODO with a matching warning", () => {
    const ir = fromZod(atBudgetList(z.array(z.string())), 13);
    const code = emitPlainForm({
      ir,
      formName: "AtBudgetForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
    });
    expect(code).toContain(
      `{/* TODO: path "${LIST}.\${index}" ${DEPTH_TODO} */}`,
    );
    expect(code).not.toContain("extract a row component");
    const warnings = overBudgetFieldPaths(ir);
    expect(warnings).toEqual([`${LIST}.*`]);
    expect(warnings).toHaveLength(depthTodoCount(code));
  });

  it("object rows emit one depth TODO per field with per-field warnings", () => {
    const ir = fromZod(atBudgetList(z.object({ x: z.string(), y: z.string() })), 13);
    const code = emitPlainForm({
      ir,
      formName: "AtBudgetRowsForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
    });
    expect(code).toContain(
      `{/* TODO: path "${LIST}.\${index}.x" ${DEPTH_TODO} */}`,
    );
    expect(code).toContain(
      `{/* TODO: path "${LIST}.\${index}.y" ${DEPTH_TODO} */}`,
    );
    const warnings = overBudgetFieldPaths(ir);
    expect(warnings).toEqual([`${LIST}.*.x`, `${LIST}.*.y`]);
    expect(warnings).toHaveLength(depthTodoCount(code));
  });

  it("the module layout says the same thing at the same sites", () => {
    const ir = fromZod(atBudgetList(z.array(z.string())), 13);
    const joined = joinModuleFiles(
      emitModuleForm({
        ir,
        formName: "AtBudgetForm",
        ui: "plain",
        schemaImport: { name: "s", from: "./external", kind: "named" },
        schemaSource: emitZodSchema(ir, "s"),
      }),
    );
    expect(joined).toContain(`{/* TODO: path "${LIST}.\${index}" ${DEPTH_TODO} */}`);
    expect(joined).not.toContain("extract it by hand");
  });
});

describe("warnings stop at each layout's degradation frontier", () => {
  // The two layouts genuinely diverge past their frontiers: the single-file
  // layout does not descend into array-of-array items (generic extract-a-row
  // TODO), the module layout does not recurse into object fields of a row
  // (generic bind-by-hand TODO). The warning walk must match the layout
  // that's emitting, or warnings promise depth TODOs the file doesn't have.
  const depthTodoCount = (code: string): number =>
    (code.match(/exceeds formstand's typed FieldPath depth/g) ?? []).length;
  const emitSingle = (ir: ReturnType<typeof fromZod>): string =>
    emitPlainForm({
      ir,
      formName: "FrontierForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
    });
  const emitModule = (ir: ReturnType<typeof fromZod>): string =>
    joinModuleFiles(
      emitModuleForm({
        ir,
        formName: "FrontierForm",
        ui: "plain",
        schemaImport: { name: "s", from: "./external", kind: "named" },
        schemaSource: emitZodSchema(ir, "s"),
      }),
    );

  // Six object levels put `list` at 7 segments; the inner rows' `x` sits at
  // 10 (o1...o6.list.*.*.x) — reachable only by the module layout, which
  // extracts the inner Rows component.
  const arrayOfArrays = z.object({
    o1: z.object({
      o2: z.object({
        o3: z.object({
          o4: z.object({
            o5: z.object({
              o6: z.object({
                list: z.array(z.array(z.object({ x: z.string() }))),
              }),
            }),
          }),
        }),
      }),
    }),
  });

  // Five object levels put `list` at 6 segments; `nest.deeper` sits at 9
  // (an object needs headroom below the budget) — reachable only by the
  // single-file layout, which lays row-object fields out inline.
  const objectInRows = z.object({
    o1: z.object({
      o2: z.object({
        o3: z.object({
          o4: z.object({
            o5: z.object({
              list: z.array(
                z.object({
                  nest: z.object({
                    deeper: z.object({ x: z.string() }),
                  }),
                }),
              ),
            }),
          }),
        }),
      }),
    }),
  });

  it("array-of-arrays: warnings match each layout's depth-TODO count", () => {
    const ir = fromZod(arrayOfArrays);
    const single = emitSingle(ir);
    const moduleJoined = emitModule(ir);
    // Single-file degrades the container item to the generic TODO — no
    // depth TODO, so no depth warning either.
    expect(single).toContain("extract a row component");
    expect(depthTodoCount(single)).toBe(0);
    expect(overBudgetFieldPaths(ir, depthWarningFrontier("single"))).toEqual([]);
    // The module layout descends and emits exactly one depth TODO (the
    // inner rows' field), mirrored one for one.
    const moduleWarnings = overBudgetFieldPaths(ir, depthWarningFrontier("module"));
    expect(moduleWarnings).toEqual(["o1.o2.o3.o4.o5.o6.list.*.*.x"]);
    expect(depthTodoCount(moduleJoined)).toBe(moduleWarnings.length);
  });

  it("object-in-rows: warnings match each layout's depth-TODO count", () => {
    const ir = fromZod(objectInRows);
    const single = emitSingle(ir);
    const moduleJoined = emitModule(ir);
    // Single-file recurses into the row object and emits exactly one depth
    // TODO (at `nest.deeper`), mirrored one for one.
    const singleWarnings = overBudgetFieldPaths(ir, depthWarningFrontier("single"));
    expect(singleWarnings).toEqual(["o1.o2.o3.o4.o5.list.*.nest.deeper"]);
    expect(depthTodoCount(single)).toBe(singleWarnings.length);
    // The module layout degrades the row's object field to the generic TODO
    // — no depth TODO, so no depth warning either.
    expect(moduleJoined).toContain("bind it by hand");
    expect(depthTodoCount(moduleJoined)).toBe(0);
    expect(overBudgetFieldPaths(ir, depthWarningFrontier("module"))).toEqual([]);
  });

  it("the default frontier is the single-file layout's", () => {
    const ir = fromZod(objectInRows);
    expect(overBudgetFieldPaths(ir)).toEqual(
      overBudgetFieldPaths(ir, depthWarningFrontier("single")),
    );
  });
});

describe("deep chains at DEFAULT flags", () => {
  it("the walker budget derives from the path budget (one level past it)", () => {
    // The walker must reach one level PAST the 9-segment path budget so a
    // leaf of up to 10 segments degrades via the PATH budget (real subtree
    // + depth TODO) rather than via walker truncation and its wrong-kind
    // string fallback. Deeper leaves DO truncate — the suite below pins
    // that they force the cast and their own stderr warning.
    expect(DEFAULT_MAX_DEPTH).toBe(FORMSTAND_PATH_DEPTH + 2);
    expect(DEFAULT_MAX_DEPTH).toBe(11);
  });

  it("a 10-level object chain degrades via the PATH budget and typechecks", () => {
    const dir = freshTmpDir("depth-default-flags");
    // NO maxDepth override: the derived default must cover the chain.
    const { file, code } = ((): Readonly<{ file: string; code: string }> => {
      const code = emitPlainForm({
        ir: fromZod(deepPathsSchema),
        formName: "DeepPathsDefaultForm",
        schemaImport: {
          name: "deepPathsSchema",
          from: moduleSpecifier(dir, path.join(fixturesDir, "deepPathsSchema.ts")),
          kind: "named",
        },
      });
      const file = path.join(dir, "DeepPathsDefaultForm.tsx");
      fs.writeFileSync(file, code, "utf8");
      return { file, code };
    })();
    // No walker truncation anywhere in the output...
    expect(code).not.toContain("nesting depth limit reached");
    // ...the PATH budget does the degrading (TODO at l9), and the subtree
    // beneath it is materialized with its REAL kinds (the nullable number
    // blanks to null — the old string fallback blanked it to "" and failed
    // tsc against the imported schema).
    expect(code).toContain(
      `{/* TODO: path "l1.l2.l3.l4.l5.l6.l7.l8.l9" ${DEPTH_TODO} */}`,
    );
    expect(code).toContain("count: null,");
    expect(typecheckDiagnostics([file])).toEqual([]);
  });
});

describe("walker truncation past the derived budget (11+ segments)", () => {
  const TRUNCATED = "m1.m2.m3.m4.m5.m6.m7.m8.m9.m10.count";

  it("an 11-segment leaf truncates, forces the cast, and still typechecks", () => {
    const dir = freshTmpDir("depth-truncation");
    // NO maxDepth override: the leaf sits one past the derived budget, so
    // the walker truncates it to a string-kind stand-in BEFORE .nullable()
    // unwraps — wrong kind AND wrong flags, collected for the CLI warning.
    const ir = fromZod(deeperPathsSchema);
    expect(truncatedFieldPaths(ir)).toEqual([TRUNCATED]);
    const code = emitPlainForm({
      ir,
      formName: "DeeperPathsForm",
      schemaImport: {
        name: "deeperPathsSchema",
        from: moduleSpecifier(
          dir,
          path.join(fixturesDir, "deeperPathsSchema.ts"),
        ),
        kind: "named",
      },
    });
    // The stand-in blanks the number|null leaf to "" — a checked annotation
    // would ship 'string is not assignable to number' to the consumer, so
    // the cast MUST be emitted.
    expect(code).toContain('count: "",');
    expect(code).toContain("as unknown as FormValues");
    expect(code).not.toContain("no cast needed");
    const file = path.join(dir, "DeeperPathsForm.tsx");
    fs.writeFileSync(file, code, "utf8");
    expect(typecheckDiagnostics([file])).toEqual([]);
  });

  it("the CLI mirrors the truncation as its own stderr warning", async () => {
    const dir = freshTmpDir("depth-truncation-cli");
    const out = path.join(dir, "DeeperPathsForm.tsx");
    const chunks: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(((chunk: unknown): boolean => {
        chunks.push(String(chunk));
        return true;
      }) as typeof process.stderr.write);
    try {
      expect(
        await main([
          path.join(fixturesDir, "deeperPathsSchema.ts"),
          "--out",
          out,
        ]),
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(chunks.join("")).toContain(
      `warning: path "${TRUNCATED}" exceeds the walker nesting budget (${DEFAULT_MAX_DEPTH}); field degraded to a placeholder — raise --max-depth or bind by hand`,
    );
  });
});

describe("no regression at or below the budget", () => {
  it("the three-level nested-array module output is byte-identical to before the change", () => {
    // Captured from the emitter as it stood before the depth-budget fix
    // (see fixtures/threeLevelModule.expected.txt): teams › members › phones
    // peaks at 7 segments (`teams.${p0}.members.${p1}.phones.${index}`), so
    // the fix must not touch a byte of it.
    const orgSchema = z.object({
      teams: z.array(
        z.object({
          name: z.string(),
          members: z.array(
            z.object({
              email: z.string(),
              phones: z.array(z.string()),
            }),
          ),
        }),
      ),
    });
    const ir = fromZod(orgSchema);
    const files = emitModuleForm({
      ir,
      formName: "OrgForm",
      ui: "plain",
      schemaImport: { name: "orgSchema", from: "./external", kind: "named" },
      schemaSource: emitZodSchema(ir, "orgSchema"),
    });
    const expected = fs.readFileSync(
      path.join(fixturesDir, "threeLevelModule.expected.txt"),
      "utf8",
    );
    expect(joinModuleFiles(files)).toBe(expected);
  });
});

describe("CLI warnings for over-budget paths", () => {
  it("mirrors each degraded path on stderr", async () => {
    const dir = freshTmpDir("depth-cli-warn");
    const out = path.join(dir, "DeepPathsForm.tsx");
    const chunks: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(((chunk: unknown): boolean => {
        chunks.push(String(chunk));
        return true;
      }) as typeof process.stderr.write);
    try {
      expect(
        await main([
          path.join(fixturesDir, "deepPathsSchema.ts"),
          "--out",
          out,
          "--max-depth",
          "12",
        ]),
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(chunks.join("")).toContain(
      `warning: path "l1.l2.l3.l4.l5.l6.l7.l8.l9" exceeds formstand's typed FieldPath depth (${FORMSTAND_PATH_DEPTH}); emitted a TODO — bind it by hand`,
    );
  });
});
