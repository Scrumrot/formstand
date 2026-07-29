// Regenerates the playground's "Generated" demos with the CURRENT CLI —
// run after changing the emitters (CI regenerates and fails on drift, so
// the tabs are provably what formstand-gen emits today). Do not hand-edit
// anything under examples/src/generated/.
import { execFileSync } from "node:child_process";

const boundarySchemas = "examples/src/generated/boundarySchemas.ts";

const onboardingSchema = "examples/src/forms/OnboardingForm/schema.ts";

// The three kit demos share ONE schema (Onboarding) and ONE chrome
// (--sections panel --columns 2, matching the mui demo above), varying the
// --ui backend — but note the LAYOUTS differ too: the mui tab is
// --layout module (it doubles as the module-layout showcase), while these
// three are single-file, keeping each one a one-file diff. So two axes
// vary across the four "CLI output" tabs: the kit backend, and
// module-vs-single file layout.
const kitDemo = (ui, name) => [
  onboardingSchema,
  "--ui",
  ui,
  "--sections",
  "panel",
  "--columns",
  "2",
  "--name",
  name,
  "--out",
  `examples/src/generated/${name}.tsx`,
];

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
  // boundary in one demo. No --max-depth needed: the walkers' default
  // nesting budget is derived from the path budget (9 + 2 = 11), so the
  // PATH budget is the only thing degrading here at default flags.
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
  kitDemo("chakra", "ChakraOnboardingForm"),
  kitDemo("mantine", "MantineOnboardingForm"),
  kitDemo("antd", "AntdOnboardingForm"),
  // The --live --form-prop demo: no submit scaffold (onValuesChange streams
  // every value change instead) and the page owns the form via the exported
  // useFlightSearchForm() hook. --ui plain (default) keeps the generated
  // file dependency-free; the hand-written consumer page lives at
  // examples/src/forms/FlightSearchLive.tsx. The --config fixture adds the
  // per-field component overrides (fields): origin/destination are plain
  // ICAO strings whose suggestion list is DATA, so they upgrade to
  // autocomplete and the component takes originOptions/destinationOptions —
  // the twin project's exact page, generated.
  [
    "examples/src/generated/flightSearchSchema.ts",
    "--export",
    "flightSearchSchema",
    "--live",
    "--form-prop",
    "--config",
    "examples/src/generated/flightSearch.config.ts",
    "--name",
    "FlightSearchForm",
    "--out",
    "examples/src/generated/FlightSearchForm.tsx",
  ],
];

commands.forEach((args) =>
  execFileSync("node", ["cli/dist/cli.js", ...args, "--force"], {
    stdio: "inherit",
  }),
);
