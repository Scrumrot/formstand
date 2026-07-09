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
import { HooksFactoryForm } from "./forms/HooksFactoryForm";
import { OnboardingForm } from "./forms/OnboardingForm";
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
  {
    key: "hooksFactory",
    label: "Hooks factory",
    render: () => <HooksFactoryForm />,
  },
  {
    key: "onboarding",
    label: "Onboarding",
    render: () => <OnboardingForm />,
  },
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

type GroupTitle = "Core" | "Patterns" | "Material UI" | "shadcn/ui";

// Exhaustive over TabKey on purpose: a new demo that isn't assigned a
// sidebar group is a compile error, not a missing nav entry.
const GROUP_OF: Readonly<Record<TabKey, GroupTitle>> = {
  basic: "Core",
  bound: "Core",
  context: "Core",
  hooksFactory: "Core",
  nested: "Core",
  array: "Core",
  async: "Core",
  wizard: "Core",
  conditional: "Core",
  invoice: "Patterns",
  nestedArrays: "Patterns",
  server: "Patterns",
  autosave: "Patterns",
  dependent: "Patterns",
  optimistic: "Patterns",
  file: "Patterns",
  derived: "Patterns",
  tag: "Patterns",
  onboarding: "Patterns",
  perf: "Patterns",
  muiCheckout: "Material UI",
  muiJob: "Material UI",
  muiInvoice: "Material UI",
  muiSettings: "Material UI",
  muiSurvey: "Material UI",
  shadSignup: "shadcn/ui",
  shadCheckout: "shadcn/ui",
  shadSettings: "shadcn/ui",
  shadTeam: "shadcn/ui",
};

const GROUP_TITLES: readonly GroupTitle[] = [
  "Core",
  "Patterns",
  "Material UI",
  "shadcn/ui",
];

const GROUPS = GROUP_TITLES.map((title) => ({
  title,
  tabs: TABS.filter((tab) => GROUP_OF[tab.key] === title),
}));

export const App = () => {
  const [active, setActive] = useState<TabKey>("basic");
  const current = TABS.find((t) => t.key === active);

  return (
    <div className="shell">
      <aside className="sidebar">
      <a
        className="brand"
        href="https://scrumrot.github.io/formstand/"
        title="formstand docs"
      >
        {/* The mark: a form (with its green check) on a music stand. */}
        <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <g
            stroke="#D99A3D"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="12" y="7" width="40" height="29" rx="6" />
            <path d="M20 17h16" />
            <path d="M20 26h9" />
            <path d="M32 36v13" />
            <path d="M32 49l-11 9" />
            <path d="M32 49l11 9" />
            <path d="M32 49v9" />
          </g>
          <path
            d="M37 25l4 4 7.5-8.5"
            stroke="#86C166"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1>formstand</h1>
        <span className="brand-badge">playground</span>
      </a>

      <nav className="nav" aria-label="Demos">
        {GROUPS.map((group) => (
          <div key={group.title} className="nav-group">
            <div className="nav-group-title">{group.title}</div>
            {group.tabs.map((tab) => (
              <button
                key={tab.key}
                className={`nav-tab ${tab.key === active ? "active" : ""}`}
                onClick={() => setActive(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <p className="sidebar-foot">
        Every demo runs against the real library. Source:{" "}
        <a href="https://github.com/Scrumrot/formstand/tree/main/examples/src">
          examples/src
        </a>{" "}
        · <a href="https://scrumrot.github.io/formstand/">docs</a>
      </p>
    </aside>

    <main className="content">
      <div className="content-inner">
        <h2 className="demo-title">{current?.label ?? ""}</h2>
        <div className="card">
          {current !== undefined ? (
            <DemoShell key={current.key} files={DEMO_SOURCES[current.key]}>
              {current.render()}
            </DemoShell>
          ) : null}
        </div>
      </div>
    </main>
  </div>
  );
};
