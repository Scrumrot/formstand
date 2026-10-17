import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import {
  fixturesDir,
  freshTmpDir,
  muiStubPaths,
  typecheckDiagnostics,
} from "./helpers";

// A variant with nothing beyond its discriminant has no block to render.
// Every emitter used to wrap that nothing in `cond && (<></>)`: legal JSX,
// but it read as a bug in every generated file. The variant now leaves a
// one-line comment naming its tag instead, in the single-file kits, the
// row-union components, and the module layout's union sections and rows.

const fixture = path.join(fixturesDir, "discriminantOnlySchema.ts");

const listFiles = (dir: string): readonly string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? listFiles(path.join(dir, entry.name))
        : [path.join(dir, entry.name)],
    );

const expectNoEmptyBlock = (code: string): void => {
  expect(code).not.toContain("<></>");
  expect(code).not.toMatch(/<>\s*<\/>/);
  expect(code).toContain('variant "pickup": only the discriminant');
  expect(code).toContain('variant "walk": only the discriminant');
  // The variant WITH fields still renders its conditional block.
  expect(code).toContain('.value === "delivery" && (');
};

describe("discriminant-only variants", () => {
  it("plain output skips the empty block and typechecks", async () => {
    const dir = freshTmpDir("discriminant-only-plain");
    const out = path.join(dir, "FulfilmentForm.tsx");
    expect(await main([fixture, "--out", out])).toBe(0);
    expectNoEmptyBlock(fs.readFileSync(out, "utf8"));
    expect(typecheckDiagnostics([out])).toEqual([]);
  });

  it("mui output skips the empty block and typechecks", async () => {
    const dir = freshTmpDir("discriminant-only-mui");
    const out = path.join(dir, "FulfilmentForm.tsx");
    expect(await main([fixture, "--ui", "mui", "--out", out])).toBe(0);
    expectNoEmptyBlock(fs.readFileSync(out, "utf8"));
    expect(typecheckDiagnostics([out], muiStubPaths)).toEqual([]);
  });

  it("the module layout skips the empty block in sections and rows", async () => {
    const dir = freshTmpDir("discriminant-only-module");
    expect(await main([fixture, "--layout", "module", "--out", dir])).toBe(0);
    const files = listFiles(dir);
    const joined = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expectNoEmptyBlock(joined);
    expect(typecheckDiagnostics(files)).toEqual([]);
  });
});
