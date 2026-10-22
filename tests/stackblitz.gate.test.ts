import { describe, expect, it } from "vitest";
import {
  DEMO_SOURCES,
  type DemoSourceKey,
  loadDemoFiles,
} from "../examples/src/demo/demoSources";
import { canOpenInStackBlitz } from "../examples/src/demo/stackblitz";

// The "Open in StackBlitz" gate requires every relative import in a demo to
// resolve inside the demo's own file set. When the hand-rolled demos gained
// a shared error-wiring helper (./fieldA11y), the helper was not in their
// sets, so the button silently disappeared from seventeen demos in the
// playground and in the docs' example listings, and no test noticed: the
// seed test checks the toolchain on a fixture, not the real sources. This
// loads every demo's real sources through the same loaders the shell uses
// and pins which demos open.

// The self-contained demos: plain React plus formstand and zod, nothing
// from the playground's kit scaffolding. Add a key here when a new
// hand-rolled demo lands; a kit or module demo belongs in the other list.
const OPENABLE: readonly DemoSourceKey[] = [
  "basic",
  "bound",
  "context",
  "hooksFactory",
  "nested",
  "array",
  "async",
  "wizard",
  "conditional",
  "invoice",
  "nestedArrays",
  "server",
  "autosave",
  "dependent",
  "actions",
  "optimistic",
  "file",
  "derived",
  "tag",
  "perf",
  "devtools",
  "cliCommand",
];

const loadedSets = async () =>
  Promise.all(
    (Object.keys(DEMO_SOURCES) as DemoSourceKey[]).map(async (key) => ({
      key,
      files: await loadDemoFiles(DEMO_SOURCES[key]),
    })),
  );

describe("StackBlitz gate over the real demo sources", () => {
  it("every self-contained demo opens", async () => {
    const sets = await loadedSets();
    const closed = sets
      .filter(({ key }) => OPENABLE.includes(key))
      .filter(({ files }) => !canOpenInStackBlitz(files))
      .map(({ key }) => key);
    expect(closed).toEqual([]);
  });

  it("a demo that imports ./fieldA11y ships the helper in its file set", async () => {
    const sets = await loadedSets();
    const missing = sets
      .filter(({ files }) =>
        files.some((file) => file.source.includes(`"./fieldA11y"`)),
      )
      .filter(({ files }) => !files.some((file) => file.path === "fieldA11y.ts"))
      .map(({ key }) => key);
    expect(missing).toEqual([]);
  });

  it("the helper itself only imports from formstand", async () => {
    const sets = await loadedSets();
    const helper = sets
      .flatMap(({ files }) => files)
      .find((file) => file.path === "fieldA11y.ts");
    expect(helper).toBeDefined();
    expect(helper?.source).toMatch(/from "formstand"/);
    expect(helper?.source).not.toMatch(/from "\.\.?\//);
  });
});
