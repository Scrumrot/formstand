import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { main } from "../src/cli";
import { emitZodSchema, unmodeledCheckPaths } from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { collectTestPlan } from "../src/testCases";
import { emitComponentSpec } from "../src/testsEmit";
import {
  captureStderr,
  fixturesDir,
  freshTmpDir,
  specPaths,
  typecheckDiagnostics,
} from "./helpers";
import { unmodeledChecksSchema } from "./fixtures/unmodeledChecksSchema";

// The generated spec's "filled with valid values" round trip parses its
// sample with the REAL schema. The walker ignores check kinds it does not
// model (a regex, a multipleOf, a refine, a date bound, a string format the
// IR cannot carry), so the sample was built blind to them and the live case
// failed on its own fixture. The walker now records those check kinds per
// path, and the spec skips the case over them, the way it already did for
// degraded leaves.

const schemaImport = {
  name: "unmodeledChecksSchema",
  from: "./unmodeledChecksSchema",
  kind: "named",
} as const;

const specFor = (ir: ReturnType<typeof fromZod>, formName: string): string =>
  emitComponentSpec({
    runner: "vitest",
    formName,
    schemaImport,
    ir,
    plan: collectTestPlan(ir),
    componentImport: `./${formName}`,
    skipRender: false,
    asyncSchema: false,
    optionsProps: [],
  });

describe("the generated spec skips its round trip over unmodeled checks", () => {
  const ir = fromZod(unmodeledChecksSchema);
  const spec = specFor(ir, "ChecksForm");

  it("the walker records the check kinds it does not model, per path", () => {
    expect(unmodeledCheckPaths(ir)).toEqual([
      { path: "zip", checks: ["regex"] },
      { path: "code", checks: ["starts_with"] },
      { path: "ip", checks: ["ipv4"] },
      { path: "step", checks: ["multiple_of"] },
      { path: "handle", checks: ["custom"] },
      { path: "when", checks: ["greater_than"] },
    ]);
  });

  it("a wrapper's own refine and an object-level refine are recorded too", () => {
    const wrapped = fromZod(
      z
        .object({
          a: z.string().optional().refine(() => true),
          b: z.string().default("x").refine(() => true),
        })
        .refine(() => true),
    );
    expect(unmodeledCheckPaths(wrapped)).toEqual([
      { path: "(root)", checks: ["custom"] },
      { path: "a", checks: ["custom"] },
      { path: "b", checks: ["custom"] },
    ]);
  });

  it("the round trip is written out but skipped, naming the paths and reasons", () => {
    expect(spec).toContain(
      'it.skip("filled with valid values, submit resolves the parsed payload"',
    );
    expect(spec).toContain('"zip" (regex)');
    expect(spec).toContain('"step" (multiple_of)');
    expect(spec).toContain('"when" (greater_than)');
    // The probes over modeled checks stay live.
    expect(spec).toContain('it("Name rejects a value shorter than 2 characters"');
    expect(spec).toContain('it("Age rejects a value below 18"');
  });

  it("a schema with only modeled checks keeps the round trip live", () => {
    const live = fromZod(z.object({ name: z.string().min(2), age: z.number().min(18) }));
    expect(unmodeledCheckPaths(live)).toEqual([]);
    expect(specFor(live, "LiveForm")).toContain(
      'it("filled with valid values, submit resolves the parsed payload"',
    );
  });

  // The prior review flagged `.email()` as possibly not blank-invalid: it
  // was real. The method form is a string_format check, not a def.format,
  // so the walker saw a plain string, the plan skipped the blank-invalid and
  // format cases, and the emitted schema dropped the format.
  it("the method-form .email()/.url()/.uuid() are modeled like the top-level spellings", () => {
    const formats = fromZod(
      z.object({
        a: z.string().email(),
        b: z.string().url(),
        c: z.string().uuid(),
      }),
    );
    const spec = (name: string) =>
      formats.kind === "object" ? formats.fields.find((f) => f.name === name)?.spec : undefined;
    expect(spec("a")).toMatchObject({ kind: "string", format: "email" });
    expect(spec("b")).toMatchObject({ kind: "string", format: "url" });
    expect(spec("c")).toMatchObject({ kind: "string", format: "uuid" });
    expect(unmodeledCheckPaths(formats)).toEqual([]);
    const formatPlan = collectTestPlan(formats);
    expect(formatPlan.requiredPaths.map((entry) => entry.path)).toEqual(["a", "b", "c"]);
    expect(formatPlan.formatChecks.map((entry) => entry.format)).toEqual(["email", "url", "uuid"]);
    expect(emitZodSchema(formats)).toContain("a: z.email(),");
  });

  it("the CLI mirrors the skip on stderr (with --tests) and the spec typechecks", async () => {
    const dir = freshTmpDir("unmodeled-cli");
    const out = path.join(dir, "ChecksForm.tsx");
    // --name pins the spec's file name (it follows the form name, not the
    // --out basename); the existence check keeps the typecheck honest, a
    // missing root file yields no diagnostics.
    const text = await captureStderr(async () => {
      expect(
        await main([
          path.join(fixturesDir, "unmodeledChecksSchema.ts"),
          "--name",
          "ChecksForm",
          "--tests",
          "vitest",
          "--out",
          out,
        ]),
      ).toBe(0);
    });
    expect(text).toContain(
      'warning: field "zip" has checks the generator does not model (regex); the generated spec skips its round trip',
    );
    expect(text).not.toContain('warning: field "name"');
    const spec = path.join(dir, "ChecksForm.test.tsx");
    expect(fs.existsSync(spec)).toBe(true);
    expect(fs.readFileSync(spec, "utf8")).toContain('it.skip("filled with valid values');
    expect(typecheckDiagnostics([out, spec], specPaths)).toEqual([]);
  });

  it("without --tests nothing is skipped, so nothing is warned", async () => {
    const dir = freshTmpDir("unmodeled-cli-no-tests");
    const text = await captureStderr(async () => {
      expect(
        await main([
          path.join(fixturesDir, "unmodeledChecksSchema.ts"),
          "--out",
          path.join(dir, "ChecksForm.tsx"),
        ]),
      ).toBe(0);
    });
    expect(text).not.toContain("does not model");
  });
});
