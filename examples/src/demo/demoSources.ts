/// <reference path="./raw.d.ts" />
// The triple-slash reference (not vite/client) carries the `*?raw` module
// declaration into every program that pulls this file in — the root
// typecheck and the vitest smoke test compile it without Vite's types.
import arraySrc from "../forms/ArrayForm.tsx?raw";
import asyncSrc from "../forms/AsyncForm.tsx?raw";
import autosaveSrc from "../forms/AutosaveForm.tsx?raw";
import basicSrc from "../forms/BasicForm.tsx?raw";
import boundSrc from "../forms/BoundFieldsForm.tsx?raw";
import conditionalSrc from "../forms/ConditionalForm.tsx?raw";
import contextSrc from "../forms/ContextForm.tsx?raw";
import dependentSrc from "../forms/DependentFieldsForm.tsx?raw";
import derivedSrc from "../forms/DerivedFieldForm.tsx?raw";
import fileSrc from "../forms/FileUploadForm.tsx?raw";
import hooksFactorySrc from "../forms/HooksFactoryForm.tsx?raw";
import invoiceSrc from "../forms/InvoiceForm.tsx?raw";
import nestedArraysSrc from "../forms/NestedArraysForm.tsx?raw";
import nestedSrc from "../forms/NestedForm.tsx?raw";
import optimisticSrc from "../forms/OptimisticForm.tsx?raw";
import perfSrc from "../forms/PerfBenchmarkForm.tsx?raw";
import serverSrc from "../forms/ServerErrorsForm.tsx?raw";
import tagSrc from "../forms/TagInputForm.tsx?raw";
import wizardSrc from "../forms/WizardForm.tsx?raw";
import muiCheckoutSrc from "../mui/MuiCheckoutWizard.tsx?raw";
import muiInvoiceSrc from "../mui/MuiInvoiceBuilder.tsx?raw";
import muiJobSrc from "../mui/MuiJobApplication.tsx?raw";
import muiSettingsSrc from "../mui/MuiProfileSettings.tsx?raw";
import muiSurveySrc from "../mui/MuiSurveyBuilder.tsx?raw";
import shadCheckoutSrc from "../shadcn/ShadcnCheckoutForm.tsx?raw";
import shadSettingsSrc from "../shadcn/ShadcnSettingsForm.tsx?raw";
import shadSignupSrc from "../shadcn/ShadcnSignupForm.tsx?raw";
import shadTeamSrc from "../shadcn/ShadcnTeamForm.tsx?raw";

// The playground shell adds a one-line useDemoForm registration (plus its
// import) to every demo so the "View state" panel works. Those lines are
// harness, not library API — strip them from the displayed source so
// copy-pasted code compiles outside the playground.
const stripHarness = (source: string): string =>
  source
    .split("\n")
    .filter((line) => !line.includes("useDemoForm"))
    .join("\n");

// Every demo's source is a file list: single-file demos hold one entry,
// module demos (Onboarding) hold the whole folder — the shell shows a file
// tree when there is more than one.
export type DemoFile = Readonly<{ path: string; source: string }>;

const single = (path: string, raw: string): readonly DemoFile[] => [
  { path, source: stripHarness(raw) },
];

// Reading order for the Onboarding module's file tree.
const ONBOARDING_ORDER = [
  "schema.ts",
  "types.ts",
  "hooks.ts",
  "fields/",
  "sections/",
  "OnboardingForm.tsx",
  "index.ts",
];

const onboardingRank = (path: string): number => {
  const index = ONBOARDING_ORDER.findIndex((prefix) =>
    path.startsWith(prefix),
  );
  return index === -1 ? ONBOARDING_ORDER.length : index;
};

const onboardingFiles: readonly DemoFile[] = Object.entries(
  import.meta.glob("../forms/OnboardingForm/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)
  .map(([path, raw]) => ({
    path: path.replace("../forms/OnboardingForm/", ""),
    source: stripHarness(raw),
  }))
  .sort(
    (a, b) =>
      onboardingRank(a.path) - onboardingRank(b.path) ||
      a.path.localeCompare(b.path),
  );

const sources = {
  basic: single("BasicForm.tsx", basicSrc),
  bound: single("BoundFieldsForm.tsx", boundSrc),
  context: single("ContextForm.tsx", contextSrc),
  hooksFactory: single("HooksFactoryForm.tsx", hooksFactorySrc),
  onboarding: onboardingFiles,
  nested: single("NestedForm.tsx", nestedSrc),
  array: single("ArrayForm.tsx", arraySrc),
  async: single("AsyncForm.tsx", asyncSrc),
  wizard: single("WizardForm.tsx", wizardSrc),
  conditional: single("ConditionalForm.tsx", conditionalSrc),
  invoice: single("InvoiceForm.tsx", invoiceSrc),
  nestedArrays: single("NestedArraysForm.tsx", nestedArraysSrc),
  server: single("ServerErrorsForm.tsx", serverSrc),
  autosave: single("AutosaveForm.tsx", autosaveSrc),
  dependent: single("DependentFieldsForm.tsx", dependentSrc),
  optimistic: single("OptimisticForm.tsx", optimisticSrc),
  file: single("FileUploadForm.tsx", fileSrc),
  derived: single("DerivedFieldForm.tsx", derivedSrc),
  tag: single("TagInputForm.tsx", tagSrc),
  perf: single("PerfBenchmarkForm.tsx", perfSrc),
  muiCheckout: single("MuiCheckoutWizard.tsx", muiCheckoutSrc),
  muiJob: single("MuiJobApplication.tsx", muiJobSrc),
  muiInvoice: single("MuiInvoiceBuilder.tsx", muiInvoiceSrc),
  muiSettings: single("MuiProfileSettings.tsx", muiSettingsSrc),
  muiSurvey: single("MuiSurveyBuilder.tsx", muiSurveySrc),
  shadSignup: single("ShadcnSignupForm.tsx", shadSignupSrc),
  shadCheckout: single("ShadcnCheckoutForm.tsx", shadCheckoutSrc),
  shadSettings: single("ShadcnSettingsForm.tsx", shadSettingsSrc),
  shadTeam: single("ShadcnTeamForm.tsx", shadTeamSrc),
} as const;

// App.tsx derives its TabKey from this map, so the tab list and the source
// map cannot drift.
export type DemoSourceKey = keyof typeof sources;

export const DEMO_SOURCES: Readonly<
  Record<DemoSourceKey, readonly DemoFile[]>
> = sources;
