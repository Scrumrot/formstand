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
  // Single-file layout on purpose: the l1...l8 branch pushes past
  // formstand's FieldPath budget (7 segments), so the emitter degrades the
  // over-budget subtree to a `// TODO` (and warns on stderr) while the
  // `mixed` branch keeps real controls — the demo's point.
  [
    boundarySchemas,
    "--export",
    "deepBoundarySchema",
    "--name",
    "DeepBoundaryForm",
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
