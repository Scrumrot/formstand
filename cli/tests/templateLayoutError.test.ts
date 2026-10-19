import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import { captureStderr, fixturesDir, freshTmpDir } from "./helpers";

// The docs say custom templates are single-file only; the CLI's error for
// --template with --layout module still promised "(module support is
// planned)". The message now states the rule and the way out.

describe("--template with --layout module", () => {
  it("says templates apply to the single-file layout only", async () => {
    const dir = freshTmpDir("template-module-error");
    const text = await captureStderr(async () => {
      expect(
        await main([
          path.join(fixturesDir, "profileSchema.ts"),
          "--template",
          path.join(dir, "missing-template.ts"),
          "--layout",
          "module",
          "--out",
          dir,
        ]),
      ).toBe(1);
    });
    expect(text).toContain(
      "error: custom templates apply to the single-file layout only; drop --template or use --layout single",
    );
    expect(text).not.toContain("planned");
  });
});
