// The triple-slash reference (not vite/client) carries the `*?raw` module
// declaration and the import.meta.glob slice into every program that pulls
// this file in, so the root typecheck and the vitest smoke test compile it
// without Vite's types. An `import type` cannot carry ambient declarations,
// hence the directive the lint rule would otherwise flag.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- see above
/// <reference path="./raw.d.ts" />

// Every demo's source is a FILE LIST, static so the View code panel's tree
// renders the moment it opens, with the source TEXT behind a loader. The
// loaders are non-eager import.meta.glob entries: Vite emits one small
// chunk per file and fetches it on demand, where the eager version used to
// inline ~436 kB of demo text into the main bundle for a panel most visits
// never open.
export type DemoSourceFile = Readonly<{
  path: string;
  load: () => Promise<string>;
}>;

// A loaded file, what CodeView and the StackBlitz seed consume.
export type DemoFile = Readonly<{ path: string; source: string }>;

type RawLoaders = Readonly<Record<string, () => Promise<string>>>;

// One map of every raw-text loader the playground can show, keyed by the
// glob's relative path. Module folders are globbed whole so a new field
// file joins its demo's tree without a registration line here.
const RAW: RawLoaders = {
  ...import.meta.glob("../forms/*.tsx", { query: "?raw", import: "default" }),
  ...import.meta.glob("../forms/OnboardingForm/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
  }),
  ...import.meta.glob("../forms/SchemaBuilder/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
  }),
  ...import.meta.glob("../mui/*.tsx", { query: "?raw", import: "default" }),
  ...import.meta.glob("../mui/OnboardingForm/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
  }),
  ...import.meta.glob("../shadcn/*.tsx", { query: "?raw", import: "default" }),
  ...import.meta.glob("../shadcn/OnboardingForm/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
  }),
  ...import.meta.glob("../generated/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
  }),
};

// The playground shell adds a one-line useDemoForm registration (plus its
// import) to every demo so the "View state" panel works. Those lines are
// harness, not library API; strip them from the displayed source so
// copy-pasted code compiles outside the playground.
const stripHarness = (source: string): string =>
  source
    .split("\n")
    .filter((line) => !line.includes("useDemoForm"))
    .join("\n");

// A loader for one glob key. A key the glob did not match resolves to a
// visible marker instead of throwing: the panel then shows the problem and
// the smoke test's "source contains useForm(" assertion fails on it, which
// is louder than a rejected promise swallowed by an effect.
const loaderFor = (key: string): (() => Promise<string>) => {
  const load = RAW[key];
  return load === undefined
    ? () => Promise.resolve(`// no raw source registered for ${key}`)
    : () => load().then(stripHarness);
};

const single = (path: string, key: string): readonly DemoSourceFile[] => [
  { path, load: loaderFor(key) },
];

// Reading order for the module demos' file trees.
const MODULE_ORDER = [
  "schema.ts",
  "types.ts",
  "hooks.ts",
  "adapter.",
  "fields/",
  "sections/",
  "OnboardingForm.tsx",
  "MuiOnboardingForm.tsx",
  "ShadcnOnboardingForm.tsx",
  "KitchenSinkForm.tsx",
  "NestedArrayStressForm.tsx",
  "index.ts",
];

const moduleRank = (path: string): number => {
  const index = MODULE_ORDER.findIndex((prefix) => path.startsWith(prefix));
  return index === -1 ? MODULE_ORDER.length : index;
};

// Every glob entry under `prefix`, pathed relative to it and sorted into
// reading order.
const moduleFiles = (prefix: string): readonly DemoSourceFile[] =>
  Object.keys(RAW)
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({ path: key.replace(prefix, ""), load: loaderFor(key) }))
    .sort(
      (a, b) =>
        moduleRank(a.path) - moduleRank(b.path) ||
        a.path.localeCompare(b.path),
    );

// In zod mode the CLI RE-EXPORTS the input schema rather than copying it, so
// this module's schema.ts is one line pointing at ../../forms/OnboardingForm.
// That file is outside the module folder, which left the flagship "here is
// what the generator emits" demo unable to show the schema that drove it,
// the one file a reader most wants. Append the input alongside the module's
// own files, pathed so it reads as the input rather than part of the output.
const generatedMuiFiles: readonly DemoSourceFile[] = [
  ...moduleFiles("../generated/OnboardingForm/"),
  {
    path: "(input) forms/OnboardingForm/schema.ts",
    load: loaderFor("../forms/OnboardingForm/schema.ts"),
  },
];

const sources = {
  basic: single("BasicForm.tsx", "../forms/BasicForm.tsx"),
  bound: single("BoundFieldsForm.tsx", "../forms/BoundFieldsForm.tsx"),
  context: single("ContextForm.tsx", "../forms/ContextForm.tsx"),
  hooksFactory: single("HooksFactoryForm.tsx", "../forms/HooksFactoryForm.tsx"),
  onboarding: moduleFiles("../forms/OnboardingForm/"),
  nested: single("NestedForm.tsx", "../forms/NestedForm.tsx"),
  array: single("ArrayForm.tsx", "../forms/ArrayForm.tsx"),
  async: single("AsyncForm.tsx", "../forms/AsyncForm.tsx"),
  wizard: single("WizardForm.tsx", "../forms/WizardForm.tsx"),
  conditional: single("ConditionalForm.tsx", "../forms/ConditionalForm.tsx"),
  invoice: single("InvoiceForm.tsx", "../forms/InvoiceForm.tsx"),
  nestedArrays: single("NestedArraysForm.tsx", "../forms/NestedArraysForm.tsx"),
  server: single("ServerErrorsForm.tsx", "../forms/ServerErrorsForm.tsx"),
  autosave: single("AutosaveForm.tsx", "../forms/AutosaveForm.tsx"),
  dependent: single(
    "DependentFieldsForm.tsx",
    "../forms/DependentFieldsForm.tsx",
  ),
  actions: single("ActionsForm.tsx", "../forms/ActionsForm.tsx"),
  optimistic: single("OptimisticForm.tsx", "../forms/OptimisticForm.tsx"),
  file: single("FileUploadForm.tsx", "../forms/FileUploadForm.tsx"),
  derived: single("DerivedFieldForm.tsx", "../forms/DerivedFieldForm.tsx"),
  tag: single("TagInputForm.tsx", "../forms/TagInputForm.tsx"),
  perf: single("PerfBenchmarkForm.tsx", "../forms/PerfBenchmarkForm.tsx"),
  muiCheckout: single("MuiCheckoutWizard.tsx", "../mui/MuiCheckoutWizard.tsx"),
  muiJob: single("MuiJobApplication.tsx", "../mui/MuiJobApplication.tsx"),
  muiInvoice: single("MuiInvoiceBuilder.tsx", "../mui/MuiInvoiceBuilder.tsx"),
  muiSettings: single("MuiProfileSettings.tsx", "../mui/MuiProfileSettings.tsx"),
  muiSurvey: single("MuiSurveyBuilder.tsx", "../mui/MuiSurveyBuilder.tsx"),
  onboardingMui: moduleFiles("../mui/OnboardingForm/"),
  genMui: generatedMuiFiles,
  genKitchenSink: moduleFiles("../generated/KitchenSinkForm/"),
  // The untouched single-file DeepBoundaryForm.tsx next to the module
  // folders: its l1...l8 leaves sit exactly AT formstand's FieldPath budget
  // (9 segments) and bind real controls, while the l9 level's 10-segment
  // leaf exceeds it; the CLI degrades that subtree to a `// TODO`.
  genDeepNest: single(
    "DeepBoundaryForm.tsx",
    "../generated/DeepBoundaryForm.tsx",
  ),
  genArrayStress: moduleFiles("../generated/NestedArrayStressForm/"),
  // The three kit demos: one schema (Onboarding), one chrome, three
  // --ui backends, each an untouched single-file output.
  genChakra: single(
    "ChakraOnboardingForm.tsx",
    "../generated/ChakraOnboardingForm.tsx",
  ),
  genMantine: single(
    "MantineOnboardingForm.tsx",
    "../generated/MantineOnboardingForm.tsx",
  ),
  genAntd: single(
    "AntdOnboardingForm.tsx",
    "../generated/AntdOnboardingForm.tsx",
  ),
  // Explicit order: the untouched --live --form-prop output leads (the code
  // panel opens on the exported useFlightSearchForm hook and the
  // onValuesChange prop), then the hand-written consumer page that wires
  // them up, then the schema input.
  genLive: [
    {
      path: "FlightSearchForm.tsx",
      load: loaderFor("../generated/FlightSearchForm.tsx"),
    },
    {
      path: "FlightSearchLive.tsx",
      load: loaderFor("../forms/FlightSearchLive.tsx"),
    },
    {
      path: "flightSearchSchema.ts",
      load: loaderFor("../generated/flightSearchSchema.ts"),
    },
  ],
  cliCommand: single("CliCommandBuilder.tsx", "../forms/CliCommandBuilder.tsx"),
  // Explicit order (not the module glob): the component leads so the code
  // panel opens on the useForm call, then the schema, the emitter bridge,
  // the import modal and the two parsers it calls, then the zip writer.
  // Every file SchemaBuilder.tsx imports is listed: a reader who copies
  // the demo needs the parsers too, and the eval notice in the paste tab
  // points at parseZod.ts by name.
  schemaBuilder: [
    "SchemaBuilder.tsx",
    "builderSchema.ts",
    "generate.ts",
    "ImportModal.tsx",
    "parseTypeScript.ts",
    "parseZod.ts",
    "zip.ts",
  ].map((path) => ({
    path,
    load: loaderFor(`../forms/SchemaBuilder/${path}`),
  })),
  shadSignup: single("ShadcnSignupForm.tsx", "../shadcn/ShadcnSignupForm.tsx"),
  shadCheckout: single(
    "ShadcnCheckoutForm.tsx",
    "../shadcn/ShadcnCheckoutForm.tsx",
  ),
  shadSettings: single(
    "ShadcnSettingsForm.tsx",
    "../shadcn/ShadcnSettingsForm.tsx",
  ),
  shadTeam: single("ShadcnTeamForm.tsx", "../shadcn/ShadcnTeamForm.tsx"),
  onboardingShadcn: moduleFiles("../shadcn/OnboardingForm/"),
} as const;

// App.tsx derives its TabKey from this map, so the tab list and the source
// map cannot drift.
export type DemoSourceKey = keyof typeof sources;

export const DEMO_SOURCES: Readonly<
  Record<DemoSourceKey, readonly DemoSourceFile[]>
> = sources;

// Resolve a demo's file list to loaded sources, in list order.
export const loadDemoFiles = (
  files: readonly DemoSourceFile[],
): Promise<readonly DemoFile[]> =>
  Promise.all(
    files.map((file) =>
      file.load().then((source) => ({ path: file.path, source })),
    ),
  );
