// Asserts the built playground bundles exactly ONE copy of React across all
// of its chunks. The formstand alias points outside the examples package, so
// without resolve.dedupe its imports pull the repo root's React: a second
// copy whose hooks dispatcher the renderer never sets, crashing every tab at
// startup ("Cannot read properties of null (reading 'useRef')"). The jsdom
// smoke test can't catch this (the root vitest config dedupes on its own),
// so the built artifact is the only place to check. React's hook-export
// block (`.H.useRef`) appears once per bundled copy.
//
// Every JS asset is scanned, not just the entry chunk: since the demos load
// lazily, Rollup hoists React into a shared chunk and the entry holds none,
// which read as "0 copies" to the single-file version of this check. A
// duplicate can land in any chunk, so the count that matters is the total.
import fs from "node:fs";
import path from "node:path";

const assetsDir = path.join("examples", "dist", "assets");
const bundles = fs
  .readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js"));

if (bundles.length === 0) {
  console.error(`no .js bundle found in ${assetsDir}: build first.`);
  process.exitCode = 1;
} else {
  const holders = bundles
    .map((name) => {
      const js = fs.readFileSync(path.join(assetsDir, name), "utf8");
      return { name, copies: (js.match(/\.H\.useRef/g) ?? []).length };
    })
    .filter(({ copies }) => copies > 0);
  const total = holders.reduce((sum, { copies }) => sum + copies, 0);
  holders.forEach(({ name, copies }) => {
    console.log(`${name}: ${copies} React cop${copies === 1 ? "y" : "ies"}`);
  });
  console.log(
    `${bundles.length} chunks, ${total} React cop${total === 1 ? "y" : "ies"} in total`,
  );
  if (total !== 1) {
    console.error(
      `the build holds ${total} copies of React across its chunks, expected ` +
        `exactly 1: check resolve.dedupe in examples/vite.config.ts (a second ` +
        `copy crashes the playground at startup with a null hooks dispatcher; ` +
        `zero means React's hook block moved and this check needs a new marker).`,
    );
  }
  process.exitCode = total === 1 ? 0 : 1;
}
