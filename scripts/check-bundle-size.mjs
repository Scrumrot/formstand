// Fails CI when a built artifact outgrows its budget. The lazy-chunk work
// took the playground's main bundle from 2.95 MB to 381 kB with nothing
// guarding it, and the library's three entries had no size check at all;
// the test suite cannot see either regression. Budgets are gzip bytes (what
// ships over the wire, and steadier across minifier versions than raw
// bytes), set a few percent above the measured size the way the coverage
// thresholds sit a few points under measured: a deliberate growth raises the
// budget in the same PR, an accidental one fails here.
//
// Runs after `npm run build` (library) and the examples build (playground),
// which is why both sets are in one script: the CI step order already has
// both artifacts on disk by the time it runs. The playground entry's file
// name carries a content hash, so it is matched by prefix.
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

// { label, resolve the file(s), gzip budget in bytes }
//
// A library entry is measured TOGETHER with the chunks it imports (the
// `./chunk-*.js` files tsup's code splitting emits for code shared between
// entries): what a consumer ships is the entry plus its chunks, and the
// split between them is an accounting detail that moves whenever another
// entry starts or stops sharing a module. The devtools panel dropping its
// one import from path.ts moved 5 kB of raw source from a shared chunk into
// index.js and read as growth here while the total was unchanged.
//
// Re-based on 2026-11-12 for the November review fixes (the async passes
// release their flags on rejection, full-parse passes prune stale errors,
// persist fills required gaps and asks the schema about kind changes,
// submit takes an options object, createFormHooks binds every hook):
// the ESM entry plus its chunks measured 23.2 kB, the CJS entry 22.8 kB.
const BUDGETS = [
  { label: "formstand (ESM)", file: "dist/index.js", budget: 25_500 },
  { label: "formstand (CJS)", file: "dist/index.cjs", budget: 25_000 },
  { label: "formstand/devtools", file: "dist/devtools/index.js", budget: 3_600 },
  { label: "formstand/testing", file: "dist/testing/index.js", budget: 900 },
  {
    label: "playground main chunk",
    glob: { dir: "examples/dist/assets", prefix: "index-", suffix: ".js" },
    budget: 125_000,
  },
  {
    label: "playground main stylesheet",
    glob: { dir: "examples/dist/assets", prefix: "index-", suffix: ".css" },
    budget: 8_000,
  },
];

const resolveFile = (entry) => {
  if (entry.file !== undefined) return entry.file;
  const { dir, prefix, suffix } = entry.glob;
  const matches = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    : [];
  return matches.length === 1 ? path.join(dir, matches[0]) : null;
};

const gzipBytes = (file) => gzipSync(fs.readFileSync(file)).length;

// The sibling chunks an entry pulls in, by its own import/require/export
// statements (tsup emits them as `./chunk-<hash>.js` / `.cjs` next to the
// entry). One level is enough: chunks never import further chunks here, and
// a nested one would show up in the entry's own list on the next build.
const chunkImports = (file) => {
  const source = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const found = [
    ...source.matchAll(/(?:from|require\()\s*["'](\.\/chunk-[^"']+)["']/g),
  ].map(([, chunk]) => path.join(dir, chunk));
  return [...new Set(found)].filter((chunk) => fs.existsSync(chunk));
};

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

const results = BUDGETS.map((entry) => {
  const file = resolveFile(entry);
  if (file === null || !fs.existsSync(file)) {
    return { ...entry, file, size: null };
  }
  const chunks = entry.file === undefined ? [] : chunkImports(file);
  return {
    ...entry,
    file,
    size: [file, ...chunks].reduce((sum, part) => sum + gzipBytes(part), 0),
  };
});

results.forEach(({ label, file, size, budget }) => {
  if (size === null) {
    console.error(`${label}: artifact not found (${file ?? "no unique match"}); build first.`);
    return;
  }
  const pct = ((size / budget) * 100).toFixed(0);
  const verdict = size <= budget ? "ok" : "OVER BUDGET";
  console.log(`${label}: ${kb(size)} gzip of ${kb(budget)} (${pct}%) ${verdict}`);
});

const failed = results.filter(({ size, budget }) => size === null || size > budget);
if (failed.length > 0) {
  console.error(
    `\n${failed.length} artifact${failed.length === 1 ? "" : "s"} over budget or missing. ` +
      "A deliberate growth raises the budget in scripts/check-bundle-size.mjs in the same change.",
  );
  process.exitCode = 1;
}
