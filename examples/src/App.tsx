import { type ReactElement, useState } from "react";
import { DemoShell } from "./demo/DemoShell";
import { DEMO_SOURCES, type DemoSourceKey } from "./demo/demoSources";
import { ArrayForm } from "./forms/ArrayForm";
import { AsyncForm } from "./forms/AsyncForm";
import { AutosaveForm } from "./forms/AutosaveForm";
import { BasicForm } from "./forms/BasicForm";
import { BoundFieldsForm } from "./forms/BoundFieldsForm";
import { ConditionalForm } from "./forms/ConditionalForm";
import { ContextForm } from "./forms/ContextForm";
import { DependentFieldsForm } from "./forms/DependentFieldsForm";
import { DerivedFieldForm } from "./forms/DerivedFieldForm";
import { FileUploadForm } from "./forms/FileUploadForm";
import { InvoiceForm } from "./forms/InvoiceForm";
import { NestedArraysForm } from "./forms/NestedArraysForm";
import { NestedForm } from "./forms/NestedForm";
import { OptimisticForm } from "./forms/OptimisticForm";
import { PerfBenchmarkForm } from "./forms/PerfBenchmarkForm";
import { ServerErrorsForm } from "./forms/ServerErrorsForm";
import { TagInputForm } from "./forms/TagInputForm";
import { WizardForm } from "./forms/WizardForm";
import { MuiCheckoutWizard } from "./mui/MuiCheckoutWizard";
import { MuiInvoiceBuilder } from "./mui/MuiInvoiceBuilder";
import { MuiJobApplication } from "./mui/MuiJobApplication";
import { MuiProfileSettings } from "./mui/MuiProfileSettings";
import { MuiSurveyBuilder } from "./mui/MuiSurveyBuilder";
import { MuiThemeBridge } from "./mui/MuiThemeBridge";
import { ShadcnCheckoutForm } from "./shadcn/ShadcnCheckoutForm";
import { ShadcnSettingsForm } from "./shadcn/ShadcnSettingsForm";
import { ShadcnSignupForm } from "./shadcn/ShadcnSignupForm";
import { ShadcnTeamForm } from "./shadcn/ShadcnTeamForm";

// One key list for tabs and sources — adding a demo without a source entry
// (or vice versa) is a compile error.
type TabKey = DemoSourceKey;

type Tab = Readonly<{
  key: TabKey;
  label: string;
  render: () => ReactElement;
}>;

// The wrapper div is shadcn's MuiThemeBridge equivalent — the Tailwind theme
// variables and the scoped preflight both key off .shadcn-scope. Every
// shadcn demo goes through this helper so a new tab can't forget the scope
// (an unwrapped demo renders unthemed and unreset).
const shadcnTab = (
  key: TabKey,
  label: string,
  Demo: () => ReactElement,
): Tab => ({
  key,
  label,
  render: () => (
    <div className="shadcn-scope">
      <Demo />
    </div>
  ),
});

const TABS: readonly Tab[] = [
  { key: "basic", label: "Basic + modes", render: () => <BasicForm /> },
  { key: "bound", label: "Bound fields", render: () => <BoundFieldsForm /> },
  { key: "context", label: "Form context", render: () => <ContextForm /> },
  { key: "nested", label: "Nested + submit", render: () => <NestedForm /> },
  { key: "array", label: "Field array", render: () => <ArrayForm /> },
  { key: "async", label: "Async", render: () => <AsyncForm /> },
  { key: "wizard", label: "Wizard", render: () => <WizardForm /> },
  {
    key: "conditional",
    label: "Conditional",
    render: () => <ConditionalForm />,
  },
  { key: "invoice", label: "Invoice", render: () => <InvoiceForm /> },
  {
    key: "nestedArrays",
    label: "Nested arrays",
    render: () => <NestedArraysForm />,
  },
  {
    key: "server",
    label: "Server errors",
    render: () => <ServerErrorsForm />,
  },
  { key: "autosave", label: "Autosave", render: () => <AutosaveForm /> },
  {
    key: "dependent",
    label: "Dependent",
    render: () => <DependentFieldsForm />,
  },
  {
    key: "optimistic",
    label: "Optimistic",
    render: () => <OptimisticForm />,
  },
  { key: "file", label: "File upload", render: () => <FileUploadForm /> },
  { key: "derived", label: "Derived", render: () => <DerivedFieldForm /> },
  { key: "tag", label: "Tags", render: () => <TagInputForm /> },
  { key: "perf", label: "Perf", render: () => <PerfBenchmarkForm /> },
  {
    key: "muiCheckout",
    label: "MUI: Checkout",
    render: () => (
      <MuiThemeBridge>
        <MuiCheckoutWizard />
      </MuiThemeBridge>
    ),
  },
  {
    key: "muiJob",
    label: "MUI: Job form",
    render: () => (
      <MuiThemeBridge>
        <MuiJobApplication />
      </MuiThemeBridge>
    ),
  },
  {
    key: "muiInvoice",
    label: "MUI: Invoice",
    render: () => (
      <MuiThemeBridge>
        <MuiInvoiceBuilder />
      </MuiThemeBridge>
    ),
  },
  {
    key: "muiSettings",
    label: "MUI: Settings",
    render: () => (
      <MuiThemeBridge>
        <MuiProfileSettings />
      </MuiThemeBridge>
    ),
  },
  {
    key: "muiSurvey",
    label: "MUI: Survey",
    render: () => (
      <MuiThemeBridge>
        <MuiSurveyBuilder />
      </MuiThemeBridge>
    ),
  },
  shadcnTab("shadSignup", "shadcn: Signup", ShadcnSignupForm),
  shadcnTab("shadCheckout", "shadcn: Checkout", ShadcnCheckoutForm),
  shadcnTab("shadSettings", "shadcn: Settings", ShadcnSettingsForm),
  shadcnTab("shadTeam", "shadcn: Team", ShadcnTeamForm),
];

export const App = () => {
  const [active, setActive] = useState<TabKey>("basic");
  const current = TABS.find((t) => t.key === active);

  return (
    <div className="layout">
      <h1>formstand</h1>
      <p className="subtitle">
        Interactive playground — every demo runs against the real library.
        The source for each tab lives in{" "}
        <a href="https://github.com/Scrumrot/formstand/tree/main/examples/src/forms">
          examples/src/forms
        </a>
        ; the docs are at{" "}
        <a href="https://scrumrot.github.io/formstand/">
          scrumrot.github.io/formstand
        </a>
        .
      </p>
      <div className="tabs" style={{ flexWrap: "wrap" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab ${tab.key === active ? "active" : ""}`}
            onClick={() => setActive(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="card">
        {current !== undefined ? (
          <DemoShell key={current.key} source={DEMO_SOURCES[current.key]}>
            {current.render()}
          </DemoShell>
        ) : null}
      </div>
    </div>
  );
};
