import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import { freshTmpDir } from "./helpers";

// --watch regenerates by calling the same run() the first pass used, so the
// stale-module bug is reproducible without a watcher: two runs of main()
// around an edit of the input. jiti keeps one runtime module cache across
// createJiti instances, and before moduleCache was disabled the second run
// loaded the FIRST run's exports, so the regenerated file never picked up a
// field added while watching. No fs.watch here on purpose: the watcher's
// promise never resolves, and the loader is the part that was broken.

const writeSchema = (file: string, fields: readonly string[]): void => {
  fs.writeFileSync(
    file,
    [
      `import { z } from "zod";`,
      "export const watchedSchema = z.object({",
      ...fields.map((field) => `  ${field},`),
      "});",
      "",
    ].join("\n"),
    "utf8",
  );
};

describe("regeneration after an input edit", () => {
  it("the second run sees the field added between runs", async () => {
    const dir = freshTmpDir("watch-reload");
    const input = path.join(dir, "watchedSchema.ts");
    const out = path.join(dir, "WatchedForm.tsx");
    writeSchema(input, ["name: z.string()"]);
    expect(await main([input, "--out", out])).toBe(0);
    const first = fs.readFileSync(out, "utf8");
    expect(first).toContain('path={"name"}');
    expect(first).not.toContain('path={"nickname"}');

    writeSchema(input, ["name: z.string()", "nickname: z.string()"]);
    // --watch reruns with force: true for the destinations it wrote itself.
    expect(await main([input, "--out", out, "--force"])).toBe(0);
    const second = fs.readFileSync(out, "utf8");
    expect(second).toContain('path={"nickname"}');
  });
});
