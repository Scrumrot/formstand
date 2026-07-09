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

// The Onboarding demo is a whole feature module (schema/types/hooks +
// per-field and per-section files), so its "View code" panel concatenates
// every file with a banner, in reading order.
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

const onboardingSrc = Object.entries(
  import.meta.glob("../forms/OnboardingForm/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)
  .map(([path, src]) => ({
    path: path.replace("../forms/OnboardingForm/", ""),
    src,
  }))
  .sort(
    (a, b) =>
      onboardingRank(a.path) - onboardingRank(b.path) ||
      a.path.localeCompare(b.path),
  )
  .map(({ path, src }) => `// ────────── ${path}\n${src}`)
  .join("\n");

const sources = {
  basic: basicSrc,
  bound: boundSrc,
  context: contextSrc,
  hooksFactory: hooksFactorySrc,
  onboarding: onboardingSrc,
  nested: nestedSrc,
  array: arraySrc,
  async: asyncSrc,
  wizard: wizardSrc,
  conditional: conditionalSrc,
  invoice: invoiceSrc,
  nestedArrays: nestedArraysSrc,
  server: serverSrc,
  autosave: autosaveSrc,
  dependent: dependentSrc,
  optimistic: optimisticSrc,
  file: fileSrc,
  derived: derivedSrc,
  tag: tagSrc,
  perf: perfSrc,
  muiCheckout: muiCheckoutSrc,
  muiJob: muiJobSrc,
  muiInvoice: muiInvoiceSrc,
  muiSettings: muiSettingsSrc,
  muiSurvey: muiSurveySrc,
  shadSignup: shadSignupSrc,
  shadCheckout: shadCheckoutSrc,
  shadSettings: shadSettingsSrc,
  shadTeam: shadTeamSrc,
} as const;

// App.tsx derives its TabKey from this map, so the tab list and the source
// map cannot drift.
export type DemoSourceKey = keyof typeof sources;

export const DEMO_SOURCES: Readonly<Record<DemoSourceKey, string>> =
  Object.fromEntries(
    Object.entries(sources).map(([key, src]) => [key, stripHarness(src)]),
  ) as Record<DemoSourceKey, string>;
