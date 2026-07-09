// The root vitest config dedupes these packages so the smoke test resolves
// the ROOT copies, while the deployed playground is built from examples/
// against the examples copies. A one-sided lockfile bump (Dependabot lands
// in one root only) would make CI certify a different build than the one
// that ships — compile breaks are caught by the examples build step, but a
// runtime-only behavior change would sail through. This assert makes the
// drift loud. Keep the list in sync with `resolve.dedupe` in
// vitest.config.ts.
import fs from "node:fs";

const DEDUPED = [
  "react",
  "react-dom",
  "zustand",
  "zod",
  "@mui/material",
  "@mui/icons-material",
  "@emotion/react",
  "@emotion/styled",
  "radix-ui",
  "lucide-react",
];

const lockVersions = (lockPath) => {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  return Object.fromEntries(
    DEDUPED.map((name) => [
      name,
      lock.packages?.[`node_modules/${name}`]?.version,
    ]),
  );
};

const root = lockVersions("package-lock.json");
const examples = lockVersions("examples/package-lock.json");

const mismatches = DEDUPED.filter(
  (name) =>
    root[name] !== undefined &&
    examples[name] !== undefined &&
    root[name] !== examples[name],
);

mismatches.forEach((name) => {
  console.error(
    `lockfile drift: ${name} resolves to ${root[name]} at the root but ` +
      `${examples[name]} in examples/ — the smoke test and the deployed ` +
      `playground would run different builds. Bump both lockfiles together.`,
  );
});

process.exitCode = mismatches.length === 0 ? 0 : 1;
if (mismatches.length === 0) {
  console.log(
    `lockfiles agree on all ${DEDUPED.length} deduped packages present in both.`,
  );
}
