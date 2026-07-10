import { type ReactElement, useEffect, useState } from "react";
import {
  ThemeModeProvider,
  type ThemeMode,
  useGitHubStars,
  useThemeModeState,
} from "./theme";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { DemoShell, useDemoForm } from "./demo/DemoShell";
import { DEMO_SOURCES, type DemoSourceKey } from "./demo/demoSources";
import { ArrayForm } from "./forms/ArrayForm";
import { AsyncForm } from "./forms/AsyncForm";
import { AutosaveForm } from "./forms/AutosaveForm";
import { BasicForm } from "./forms/BasicForm";
import { BoundFieldsForm } from "./forms/BoundFieldsForm";
import { CliCommandBuilder } from "./forms/CliCommandBuilder";
import { ConditionalForm } from "./forms/ConditionalForm";
import { ContextForm } from "./forms/ContextForm";
import { DependentFieldsForm } from "./forms/DependentFieldsForm";
import { DerivedFieldForm } from "./forms/DerivedFieldForm";
import { FileUploadForm } from "./forms/FileUploadForm";
import {
  OnboardingForm as GeneratedOnboardingForm,
  onboardingForm as generatedOnboardingForm,
} from "./generated/OnboardingForm";
import { HooksFactoryForm } from "./forms/HooksFactoryForm";
import { OnboardingForm } from "./forms/OnboardingForm";
import { InvoiceForm } from "./forms/InvoiceForm";
import { NestedArraysForm } from "./forms/NestedArraysForm";
import { NestedForm } from "./forms/NestedForm";
import { OptimisticForm } from "./forms/OptimisticForm";
import { PerfBenchmarkForm } from "./forms/PerfBenchmarkForm";
import { SchemaBuilder } from "./forms/SchemaBuilder/SchemaBuilder";
import { ServerErrorsForm } from "./forms/ServerErrorsForm";
import { TagInputForm } from "./forms/TagInputForm";
import { WizardForm } from "./forms/WizardForm";
import { MuiCheckoutWizard } from "./mui/MuiCheckoutWizard";
import { MuiInvoiceBuilder } from "./mui/MuiInvoiceBuilder";
import { MuiJobApplication } from "./mui/MuiJobApplication";
import { MuiProfileSettings } from "./mui/MuiProfileSettings";
import { MuiSurveyBuilder } from "./mui/MuiSurveyBuilder";
import { MuiOnboardingForm } from "./mui/OnboardingForm";
import { MuiThemeBridge } from "./mui/MuiThemeBridge";
import { ShadcnOnboardingForm } from "./shadcn/OnboardingForm";
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

// The generated module ships without the playground harness (it's the
// CLI's untouched output), so this wrapper registers its form with the
// shell to power the View state panel.
const GeneratedOnboardingDemo = () => {
  useDemoForm(generatedOnboardingForm);
  return <GeneratedOnboardingForm />;
};

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
  {
    key: "onboardingMui",
    label: "MUI: Onboarding",
    render: () => (
      <MuiThemeBridge>
        <MuiOnboardingForm />
      </MuiThemeBridge>
    ),
  },
  shadcnTab("shadSignup", "shadcn: Signup", ShadcnSignupForm),
  shadcnTab("shadCheckout", "shadcn: Checkout", ShadcnCheckoutForm),
  shadcnTab("shadSettings", "shadcn: Settings", ShadcnSettingsForm),
  shadcnTab("shadTeam", "shadcn: Team", ShadcnTeamForm),
  shadcnTab("onboardingShadcn", "shadcn: Onboarding", ShadcnOnboardingForm),
  {
    key: "cliCommand",
    label: "CLI command builder",
    render: () => <CliCommandBuilder />,
  },
  {
    key: "schemaBuilder",
    label: "Schema builder",
    render: () => <SchemaBuilder />,
  },
  {
    key: "genMui",
    label: "Onboarding (CLI output)",
    render: () => (
      <MuiThemeBridge>
        <GeneratedOnboardingDemo />
      </MuiThemeBridge>
    ),
  },
];

type GroupTitle =
  | "Core"
  | "Patterns"
  | "Material UI"
  | "shadcn/ui"
  | "Generated";

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
  onboardingMui: "Material UI",
  shadSignup: "shadcn/ui",
  shadCheckout: "shadcn/ui",
  shadSettings: "shadcn/ui",
  shadTeam: "shadcn/ui",
  onboardingShadcn: "shadcn/ui",
  genMui: "Generated",
  cliCommand: "Generated",
  schemaBuilder: "Generated",
};

const GROUP_TITLES: readonly GroupTitle[] = [
  "Core",
  "Patterns",
  "Material UI",
  "shadcn/ui",
  "Generated",
];

const GROUPS = GROUP_TITLES.map((title) => ({
  title,
  tabs: TABS.filter((tab) => GROUP_OF[tab.key] === title),
}));

// Every demo gets a direct link: the tab key in kebab-case after "#/"
// (e.g. #/schema-builder). Hash routing on purpose — the playground deploys
// to static GitHub Pages, where deep paths would 404 without server tricks.
const slugOf = (key: TabKey): string =>
  key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const KEY_BY_SLUG: Readonly<Record<string, TabKey>> = Object.fromEntries(
  TABS.map((tab) => [slugOf(tab.key), tab.key]),
);

const tabFromHash = (): TabKey | undefined =>
  KEY_BY_SLUG[window.location.hash.replace(/^#\/?/, "")];

const useHashTab = (fallback: TabKey) => {
  const [active, setActive] = useState<TabKey>(() => tabFromHash() ?? fallback);
  // Back/forward and hand-edited links drive the state too.
  useEffect(() => {
    const onHashChange = () => {
      const key = tabFromHash();
      if (key !== undefined) setActive(key);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const select = (key: TabKey) => {
    setActive(key);
    window.location.hash = `/${slugOf(key)}`;
  };
  return { active, select };
};

const REPO = "Scrumrot/formstand";

// The mark: a form (with its green check) on a music stand.
const BrandMark = () => (
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
);

type ThemeToggleProps = Readonly<{ mode: ThemeMode; onToggle: () => void }>;

const ThemeToggle = ({ mode, onToggle }: ThemeToggleProps) => (
  <button
    className="icon-button"
    type="button"
    aria-label={mode === "dark" ? "switch to light theme" : "switch to dark theme"}
    onClick={onToggle}
  >
    {mode === "dark" ? (
      // sun: switch TO light
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2.5v2.5" />
          <path d="M12 19v2.5" />
          <path d="M2.5 12h2.5" />
          <path d="M19 12h2.5" />
          <path d="M5 5l1.8 1.8" />
          <path d="M17.2 17.2l1.8 1.8" />
          <path d="M19 5l-1.8 1.8" />
          <path d="M6.8 17.2l-1.8 1.8" />
        </g>
      </svg>
    ) : (
      // moon: switch TO dark
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </button>
);

const starText = (stars: number): string =>
  stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars);

const GitHubLink = () => {
  const stars = useGitHubStars(REPO);
  return (
    <a
      className="icon-button gh-link"
      href={`https://github.com/${REPO}`}
      target="_blank"
      rel="noreferrer"
      aria-label="formstand on GitHub"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
      {stars !== null ? (
        <span className="gh-stars" title={`${stars} stars`}>
          {"★"} {starText(stars)}
        </span>
      ) : null}
    </a>
  );
};

export const App = () => {
  const { active, select } = useHashTab("basic");
  const { mode, toggle } = useThemeModeState();
  const [navOpen, setNavOpen] = useState(false);
  const current = TABS.find((t) => t.key === active);
  const choose = (key: TabKey) => {
    select(key);
    // Picking a demo from the mobile drawer should land you ON the demo.
    setNavOpen(false);
  };

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <ThemeModeProvider mode={mode}>
    <div className="shell">
      {/* Mobile-only app bar: menu, title, theme + GitHub (CSS hides it
          from tablet up, where the sidebar carries the same controls). */}
      <header className="topbar">
        <button
          className="icon-button"
          type="button"
          aria-label="open demo list"
          onClick={() => setNavOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </g>
          </svg>
        </button>
        <a
          className="brand topbar-brand"
          href="https://scrumrot.github.io/formstand/"
          title="formstand docs"
        >
          <BrandMark />
          <span className="topbar-title">formstand</span>
          <span className="brand-badge">playground</span>
        </a>
        <div className="topbar-actions">
          <ThemeToggle mode={mode} onToggle={toggle} />
          <GitHubLink />
        </div>
      </header>

      {navOpen ? (
        <div
          className="nav-backdrop"
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside className={`sidebar${navOpen ? " open" : ""}`}>
      <a
        className="brand"
        href="https://scrumrot.github.io/formstand/"
        title="formstand docs"
      >
        <BrandMark />
        <h1>formstand</h1>
        <span className="brand-badge">playground</span>
      </a>

      <nav className="nav" aria-label="Demos">
        <MuiThemeBridge>
          <SimpleTreeView
            selectedItems={active}
            defaultExpandedItems={GROUP_TITLES.map((title) => `group:${title}`)}
            onSelectedItemsChange={(_event, itemId) => {
              // Group nodes only expand/collapse; leaves switch the demo.
              if (typeof itemId === "string" && !itemId.startsWith("group:")) {
                choose(itemId as TabKey);
              }
            }}
            sx={{
              "& .MuiTreeItem-content": { py: 0.4, borderRadius: 1.5 },
              "& .MuiTreeItem-content.Mui-selected": {
                backgroundColor: "rgba(226, 169, 78, 0.16)",
              },
              "& .MuiTreeItem-content.Mui-selected:hover": {
                backgroundColor: "rgba(226, 169, 78, 0.24)",
              },
            }}
          >
            {GROUPS.map((group) => (
              <TreeItem
                key={group.title}
                itemId={`group:${group.title}`}
                label={
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <FolderRoundedIcon
                      sx={{ fontSize: 17, color: "#d99a3d" }}
                    />
                    {group.title}
                  </span>
                }
              >
                {group.tabs.map((tab) => (
                  <TreeItem
                    key={tab.key}
                    className="nav-tab"
                    itemId={tab.key}
                    label={
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 14,
                        }}
                      >
                        <FactCheckOutlinedIcon
                          sx={{ fontSize: 15, color: "#7c879b" }}
                        />
                        {tab.label}
                      </span>
                    }
                  />
                ))}
              </TreeItem>
            ))}
          </SimpleTreeView>
        </MuiThemeBridge>
      </nav>

      <div className="sidebar-controls">
        <ThemeToggle mode={mode} onToggle={toggle} />
        <GitHubLink />
      </div>
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
    </ThemeModeProvider>
  );
};
