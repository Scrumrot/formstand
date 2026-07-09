// Regenerates the playground's "Generated" demos with the CURRENT CLI —
// run after changing the emitters (CI regenerates and fails on drift, so
// the tabs are provably what formstand-gen emits today). Do not hand-edit
// anything under examples/src/generated/.
import { execFileSync } from "node:child_process";

execFileSync(
  "node",
  [
    "cli/dist/cli.js",
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
    "--force",
  ],
  { stdio: "inherit" },
);
