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
  // Kept as a known-failure reproduction, NOT wired as a demo: the CLI's
  // default --max-depth (10) emits 9-segment paths, past formstand's
  // FieldPath type budget (7), so this file fails tsc (TS2820) and is
  // excluded in examples/tsconfig.json until the CLI clamps to the
  // library's budget.
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
