// Asserts the built playground bundles exactly ONE copy of React. The
// formstand alias points outside the examples package, so without
// resolve.dedupe its imports pull the repo root's React — a second copy
// whose hooks dispatcher the renderer never sets, crashing every tab at
// startup ("Cannot read properties of null (reading 'useRef')"). The jsdom
// smoke test can't catch this (the root vitest config dedupes on its own),
// so the built artifact is the only place to check. React's hook-export
// block (`.H.useRef`) appears once per bundled copy.
import fs from "node:fs";
import path from "node:path";

const assetsDir = path.join("examples", "dist", "assets");
const bundles = fs
  .readdirSync(assetsDir)
  .filter((name) => name.startsWith("index-") && name.endsWith(".js"));

if (bundles.length === 0) {
  console.error(`no index-*.js bundle found in ${assetsDir} — build first.`);
  process.exitCode = 1;
} else {
  const results = bundles.map((name) => {
    const js = fs.readFileSync(path.join(assetsDir, name), "utf8");
    const copies = (js.match(/\.H\.useRef/g) ?? []).length;
    return { name, copies };
  });
  results.forEach(({ name, copies }) => {
    console.log(`${name}: ${copies} React cop${copies === 1 ? "y" : "ies"}`);
  });
  const bad = results.filter(({ copies }) => copies !== 1);
  bad.forEach(({ name, copies }) => {
    console.error(
      `${name} bundles ${copies} copies of React — check resolve.dedupe in ` +
        `examples/vite.config.ts (a second copy crashes the playground at ` +
        `startup with a null hooks dispatcher).`,
    );
  });
  process.exitCode = bad.length === 0 ? 0 : 1;
}
