// Regenerates the playground's "Generated" demos with the CURRENT CLI —
// run after changing the emitters (CI regenerates and fails on drift, so
// the tabs are provably what formstand-gen emits today). Do not hand-edit
// anything under examples/src/generated/.
import { execFileSync } from "node:child_process";

const boundarySchemas = "examples/src/generated/boundarySchemas.ts";

const commands = [
  [
    "examples/src/forms/OnboardingForm/schema.ts",
    "--layout",
    "module",
    "--ui",
    "mui",
    "--sections",
    "panel",
    "--columns",
    "2",
    "--name",
    "OnboardingForm",
    "--out",
    "examples/src/generated/OnboardingForm",
  ],
  [
    boundarySchemas,
    "--export",
    "kitchenSinkSchema",
    "--name",
    "KitchenSinkForm",
    "--layout",
    "module",
    "--out",
    "examples/src/generated/KitchenSinkForm",
  ],
  // Single-file layout on purpose: the l1...l8 leaves sit exactly AT
  // formstand's FieldPath budget (9 segments — real controls), while the
  // l9 level's 10-segment leaf pushes past it, so the emitter degrades that
  // subtree to a `// TODO` (and warns on stderr) — both sides of the
  // boundary in one demo. --max-depth 11: the nine-level chain outgrows the
  // walkers' default nesting budget of 10, and the PATH budget must be the
  // only thing degrading here.
  [
    boundarySchemas,
    "--export",
    "deepBoundarySchema",
    "--name",
    "DeepBoundaryForm",
    "--max-depth",
    "11",
    "--out",
    "examples/src/generated/DeepBoundaryForm.tsx",
  ],
  [
    boundarySchemas,
    "--export",
    "nestedArrayStressSchema",
    "--name",
    "NestedArrayStressForm",
    "--layout",
    "module",
    "--out",
    "examples/src/generated/NestedArrayStressForm",
  ],
];

commands.forEach((args) =>
  execFileSync("node", ["cli/dist/cli.js", ...args, "--force"], {
    stdio: "inherit",
  }),
);
