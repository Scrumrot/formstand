import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import { fromZod } from "../src/fromZod";
import { collectTestPlan } from "../src/testCases";
import {
  fixturesDir,
  freshTmpDir,
  specPaths,
  typecheckDiagnostics,
} from "./helpers";
import { quotedOptionsSchema } from "./fixtures/quotedOptionsSchema";

// The generated spec's valid-values literal interpolated the first enum
// option and the first union tag RAW (`"${option}"`), where every other
// literal goes through JSON.stringify, so an option carrying a quote or a
// backslash produced a spec that did not parse.

describe("quoted enum options and union tags survive into the spec", () => {
  const plan = collectTestPlan(fromZod(quotedOptionsSchema));

  it("the valid-values literal quotes them like every other literal", () => {
    expect(plan.validValues).toContain('greeting: "say \\"hi\\"",');
    expect(plan.validValues).toContain('kind: "a \\"quoted\\" tag",');
  });

  it("the written component and spec typecheck", async () => {
    const dir = freshTmpDir("quoted-options");
    const out = path.join(dir, "QuotedForm.tsx");
    // --name pins the spec's file name (it follows the form name, not the
    // --out basename); the existence check keeps the typecheck honest, a
    // missing root file yields no diagnostics.
    expect(
      await main([
        path.join(fixturesDir, "quotedOptionsSchema.ts"),
        "--name",
        "QuotedForm",
        "--tests",
        "vitest",
        "--out",
        out,
      ]),
    ).toBe(0);
    const spec = path.join(dir, "QuotedForm.test.tsx");
    expect(fs.existsSync(spec)).toBe(true);
    expect(typecheckDiagnostics([out, spec], specPaths)).toEqual([]);
  });
});
