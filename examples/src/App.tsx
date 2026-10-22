import {
  type ComponentType,
  type ReactNode,
  lazy,
  useEffect,
  useState,
} from "react";
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
import { MuiThemeBridge } from "./mui/MuiThemeBridge";

// One key list for tabs and sources: adding a demo without a source entry
// (or vice versa) is a compile error.
type TabKey = DemoSourceKey;

// Every demo is a React.lazy chunk: the main bundle carries the shell (and
// MUI, which the sidebar tree and the code panel's file tree already need)
// while each tab's component, its UI kit, and its stylesheet load on first
// visit. Before this, App imported all 43 demos eagerly into one 2.9 MB
// chunk. The wrapper kinds below are the pieces the SHELL already has
// loaded; kit providers that would drag a kit into the main chunk (Chakra,
// Mantine, antd) live inside the lazy module instead (demo/*Bridge.tsx).
type Wrap = "none" | "mui" | "shadcn";

type LazyModule = Readonly<{ default: ComponentType }>;

type Demo = Readonly<{
  label: string;
  wrap: Wrap;
  load: () => Promise<LazyModule>;
}>;

// React.lazy wants a module with a default export and the repo bans default
// exports, so each loader names the export it wants.
const pick =
  <K extends string>(
    load: () => Promise<Readonly<Record<K, ComponentType>>>,
    key: K,
  ): (() => Promise<LazyModule>) =>
  () =>
    load().then((module) => ({ default: module[key] }));

// The generated module-layout forms ship without the playground harness
// (they are the CLI's untouched output), so this wrapper registers their
// exported form with the shell to power the View state panel.
const registered = (Component: ComponentType, form: unknown): ComponentType => {
  const RegisteredDemo = () => {
    useDemoForm(form);
    return <Component />;
  };
  return RegisteredDemo;
};

const demo = (
  label: string,
  wrap: Wrap,
  load: () => Promise<LazyModule>,
): Demo => ({ label, wrap, load });

// Exhaustive over TabKey (it IS the Record's key set), in sidebar order:
// a new source entry without a demo here is a compile error, not a missing
// tab. Object key order is insertion order for string keys, which is what
// TAB_KEYS relies on below.
const DEMOS: Readonly<Record<TabKey, Demo>> = {
  basic: demo("Basic + modes", "none", pick(() => import("./forms/BasicForm"), "BasicForm")),
  bound: demo("Bound fields", "none", pick(() => import("./forms/BoundFieldsForm"), "BoundFieldsForm")),
  context: demo("Form context", "none", pick(() => import("./forms/ContextForm"), "ContextForm")),
  hooksFactory: demo("Hooks factory", "none", pick(() => import("./forms/HooksFactoryForm"), "HooksFactoryForm")),
  onboarding: demo("Onboarding", "none", pick(() => import("./forms/OnboardingForm"), "OnboardingForm")),
  nested: demo("Nested + submit", "none", pick(() => import("./forms/NestedForm"), "NestedForm")),
  array: demo("Field array", "none", pick(() => import("./forms/ArrayForm"), "ArrayForm")),
  async: demo("Async", "none", pick(() => import("./forms/AsyncForm"), "AsyncForm")),
  wizard: demo("Wizard", "none", pick(() => import("./forms/WizardForm"), "WizardForm")),
  conditional: demo("Conditional", "none", pick(() => import("./forms/ConditionalForm"), "ConditionalForm")),
  invoice: demo("Invoice", "none", pick(() => import("./forms/InvoiceForm"), "InvoiceForm")),
  nestedArrays: demo("Nested arrays", "none", pick(() => import("./forms/NestedArraysForm"), "NestedArraysForm")),
  server: demo("Server errors", "none", pick(() => import("./forms/ServerErrorsForm"), "ServerErrorsForm")),
  autosave: demo("Autosave", "none", pick(() => import("./forms/AutosaveForm"), "AutosaveForm")),
  dependent: demo("Dependent", "none", pick(() => import("./forms/DependentFieldsForm"), "DependentFieldsForm")),
  optimistic: demo("Optimistic", "none", pick(() => import("./forms/OptimisticForm"), "OptimisticForm")),
  actions: demo("Actions", "none", pick(() => import("./forms/ActionsForm"), "ActionsForm")),
  file: demo("File upload", "none", pick(() => import("./forms/FileUploadForm"), "FileUploadForm")),
  derived: demo("Derived", "none", pick(() => import("./forms/DerivedFieldForm"), "DerivedFieldForm")),
  tag: demo("Tags", "none", pick(() => import("./forms/TagInputForm"), "TagInputForm")),
  perf: demo("Perf", "none", pick(() => import("./forms/PerfBenchmarkForm"), "PerfBenchmarkForm")),
  devtools: demo("Devtools", "none", pick(() => import("./forms/DevtoolsDemo"), "DevtoolsDemo")),
  muiCheckout: demo("MUI: Checkout", "mui", pick(() => import("./mui/MuiCheckoutWizard"), "MuiCheckoutWizard")),
  muiJob: demo("MUI: Job form", "mui", pick(() => import("./mui/MuiJobApplication"), "MuiJobApplication")),
  muiInvoice: demo("MUI: Invoice", "mui", pick(() => import("./mui/MuiInvoiceBuilder"), "MuiInvoiceBuilder")),
  muiSettings: demo("MUI: Settings", "mui", pick(() => import("./mui/MuiProfileSettings"), "MuiProfileSettings")),
  muiSurvey: demo("MUI: Survey", "mui", pick(() => import("./mui/MuiSurveyBuilder"), "MuiSurveyBuilder")),
  onboardingMui: demo("MUI: Onboarding", "mui", pick(() => import("./mui/OnboardingForm"), "MuiOnboardingForm")),
  shadSignup: demo("shadcn: Signup", "shadcn", pick(() => import("./shadcn/ShadcnSignupForm"), "ShadcnSignupForm")),
  shadCheckout: demo("shadcn: Checkout", "shadcn", pick(() => import("./shadcn/ShadcnCheckoutForm"), "ShadcnCheckoutForm")),
  shadSettings: demo("shadcn: Settings", "shadcn", pick(() => import("./shadcn/ShadcnSettingsForm"), "ShadcnSettingsForm")),
  shadTeam: demo("shadcn: Team", "shadcn", pick(() => import("./shadcn/ShadcnTeamForm"), "ShadcnTeamForm")),
  onboardingShadcn: demo("shadcn: Onboarding", "shadcn", pick(() => import("./shadcn/OnboardingForm"), "ShadcnOnboardingForm")),
  cliCommand: demo("CLI command builder", "none", pick(() => import("./forms/CliCommandBuilder"), "CliCommandBuilder")),
  // The builder imports the CLI's real emitters (cli/src/codegen-api, about
  // 170 kB); lazy-loading the tab keeps them out of the main chunk.
  schemaBuilder: demo("Schema builder", "none", pick(() => import("./forms/SchemaBuilder/SchemaBuilder"), "SchemaBuilder")),
  genMui: demo("Onboarding (CLI output)", "mui", () =>
    import("./generated/OnboardingForm").then((module) => ({
      default: registered(module.OnboardingForm, module.onboardingForm),
    })),
  ),
  genKitchenSink: demo("Gen: kitchen sink", "none", () =>
    import("./generated/KitchenSinkForm").then((module) => ({
      default: registered(module.KitchenSinkForm, module.kitchenSinkForm),
    })),
  ),
  // The single-file layout exports no form instance (useForm inside the
  // component), so there is nothing to register with useDemoForm: the
  // View state panel stays empty, like the builder tabs.
  genDeepNest: demo("Gen: deep nesting", "none", pick(() => import("./generated/DeepBoundaryForm"), "DeepBoundaryForm")),
  genArrayStress: demo("Gen: nested arrays", "none", () =>
    import("./generated/NestedArrayStressForm").then((module) => ({
      default: registered(
        module.NestedArrayStressForm,
        module.nestedArrayStressForm,
      ),
    })),
  ),
  // The three kit demos are the SAME Onboarding schema and the same
  // chrome (--sections panel --columns 2) as the mui tab above, with the
  // --ui backend varying, but note the layouts differ too: the mui tab is
  // --layout module (it doubles as the module-layout showcase), while
  // these three are single-file. Flipping between the four tabs still
  // compares the kit backends directly; just remember the file structure
  // axis. Each kit's provider bridge lives in the lazy module with the
  // generated form, so the kit itself loads with its tab.
  genChakra: demo("Gen: Chakra UI", "none", pick(() => import("./demo/ChakraBridge"), "ChakraOnboardingDemo")),
  genMantine: demo("Gen: Mantine", "none", pick(() => import("./demo/MantineBridge"), "MantineOnboardingDemo")),
  genAntd: demo("Gen: Ant Design", "none", pick(() => import("./demo/AntdBridge"), "AntdOnboardingDemo")),
  genLive: demo("Gen: live + form prop", "none", pick(() => import("./forms/FlightSearchLive"), "FlightSearchLive")),
};

const TAB_KEYS = Object.keys(DEMOS) as readonly TabKey[];

// Object.fromEntries loses the key set (it returns a string index signature),
// so this keeps the exhaustive Record type across a per-value map; the cast
// is sound because the entries are the input's own keys.
const mapValues = <K extends string, V, R>(
  record: Readonly<Record<K, V>>,
  map: (value: V) => R,
): Readonly<Record<K, R>> =>
  Object.fromEntries(
    Object.entries<V>(record).map(([key, value]) => [key, map(value)]),
  ) as Readonly<Record<K, R>>;

// One lazy component per tab, created once at module scope: React.lazy
// caches the resolved module, and a fresh lazy() per render would remount
// the demo (and refetch) on every shell re-render.
const LAZY_DEMOS: Readonly<Record<TabKey, ComponentType>> = mapValues(
  DEMOS,
  (entry) => lazy(entry.load),
);

type WrapperProps = Readonly<{ children: ReactNode }>;

const Unwrapped = ({ children }: WrapperProps) => <>{children}</>;

// shadcn's MuiThemeBridge equivalent: the Tailwind theme variables and the
// scoped preflight both key off .shadcn-scope. Every shadcn demo goes
// through this wrapper so a new tab can't forget the scope (an unwrapped
// demo renders unthemed and unreset).
const ShadcnScope = ({ children }: WrapperProps) => (
  <div className="shadcn-scope">{children}</div>
);

// Exhaustive over Wrap: a new wrapper kind without a component is a compile
// error.
const WRAPPERS: Readonly<Record<Wrap, ComponentType<WrapperProps>>> = {
  none: Unwrapped,
  mui: MuiThemeBridge,
  shadcn: ShadcnScope,
};

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
  actions: "Patterns",
  file: "Patterns",
  derived: "Patterns",
  tag: "Patterns",
  onboarding: "Patterns",
  perf: "Patterns",
  devtools: "Patterns",
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
  genKitchenSink: "Generated",
  genDeepNest: "Generated",
  genArrayStress: "Generated",
  genChakra: "Generated",
  genMantine: "Generated",
  genAntd: "Generated",
  genLive: "Generated",
  cliCommand: "Generated",
  schemaBuilder: "Generated",
};

// One honest line per demo: what it shows, in the library's own terms.
// Exhaustive over TabKey (like GROUP_OF), so a new demo without a blurb is
// a compile error.
const BLURBS: Readonly<Record<TabKey, string>> = {
  basic:
    "The smallest real form, plus a live switcher for every validation mode and reValidateMode.",
  bound:
    "The four shipped components (TextField, NumberField, SelectField, CheckboxField) with their a11y wiring and a validity-gated submit.",
  context:
    "createFormContext: zero prop drilling with typed paths intact, the flag hooks as a status bar, and adoptValues as the post-save rebase.",
  hooksFactory:
    'createFormHooks(form, "invoice"): a module-singleton form baked into exported hooks: no provider, no form prop anywhere.',
  onboarding:
    "A 26-field, five-section feature module: one file per field, one per section, with path-scoped dirty/valid badges in each section header.",
  nested: "Nested object paths and the full handleSubmit flow.",
  array:
    "useFieldArray basics: push, remove, and reorder with stable row ids. Ops revalidate the array path: after a submit, remove the last row and the min(1) message appears live; add one back and it clears, no resubmit.",
  async:
    "Two async refines with different latencies: per-field debounce and spinners, race handling, one form-level useIsValidating line, and a submit gated on it.",
  wizard:
    "Multi-step with useFormSteps: next() gates on the current step, goTo lands on the first invalid step.",
  conditional:
    "A z.discriminatedUnion payment method: the discriminant binds with useField, the branch-only fields with useVariantField, and the submit payload carries only the active branch.",
  invoice: "A larger, realistic form: line-item arrays with derived totals.",
  nestedArrays: "Arrays inside array rows, with ids stable at both levels.",
  server:
    "Server errors that survive background revalidation and release when you edit the field.",
  autosave:
    "Draft persistence with watchValues + localStorage, restored on mount, with dirtyFields() reporting what changed.",
  dependent: "Cross-field reactions with watchValue.",
  optimistic: "Optimistic UI with snapshot()/restore() rollback.",
  actions:
    "React 19 form actions: useFormActionState validates before the action runs and keeps the last verdict.",
  file: "File inputs and validating File values.",
  derived:
    "Computed values via selectors: consistent by construction, never stored.",
  tag: "A tag input over an array of primitives.",
  perf: "A 200-row stress test showing per-field re-render isolation.",
  devtools:
    "formstand/devtools mounted next to a form: per-field rows, both error channels, the root refine error no input shows, the live diff, snapshot and restore. Opted in with `enabled` because this build is production.",
  muiCheckout:
    "A Stepper wizard gating each step with validateFields, a billing-same-as-shipping Switch that copies values, and a review step reading everything via useFormValues.",
  muiJob:
    "Autocomplete over an array field, a salary Slider, an async email check, and a server rejection via setError.",
  muiInvoice:
    "useFieldArray rendered as a MUI Table with reorder/delete, derived totals, a dirty-gated save, and Add line moving focus into the new row via focusField.",
  muiSettings:
    "Card-sectioned settings with a nullable bio, live dirtyFields() chips, and Save/Discard as adoptValues/reset.",
  muiSurvey:
    "Nested field arrays (sections → questions) with type-switched editors and a root-level refine.",
  onboardingMui:
    "The Onboarding feature module over Material UI: Accordion sections with dirty/valid chips.",
  shadSignup:
    "An async username check isolated to its subschema, a cross-field password confirmation, and a must-accept Checkbox.",
  shadCheckout:
    "A checkout over shadcn/ui: the Radix dialect (onCheckedChange, onValueChange) bound through the adapter.",
  shadSettings:
    "Settings over shadcn/ui components with aria-invalid error styling.",
  shadTeam: "A team editor: field arrays over shadcn/ui cards.",
  onboardingShadcn:
    "The Onboarding feature module over shadcn/ui: collapsible sections with dirty/valid badges.",
  genMui:
    "formstand-gen's untouched --layout module --ui mui --sections panel output; CI regenerates it and fails on drift.",
  genKitchenSink:
    "Every schema kind and wrapper the CLI supports in one form, tuple included, as untouched --layout module output.",
  genDeepNest:
    "Nine levels of nesting, untouched single-file output: leaves exactly AT formstand's 9-segment FieldPath budget bind real controls, while the level past it degrades to a // TODO.",
  genArrayStress:
    "Three-level nested arrays (teams → members → phones) from the CLI's recursive row extraction, untouched module output. The form opens empty: add a team, then members and phones appear inside it.",
  genChakra:
    "The same Onboarding schema as the mui tab through --ui chakra: Chakra UI v3's compound Field/NativeSelect/Switch components, untouched single-file output.",
  genMantine:
    "The same Onboarding schema through --ui mantine: Mantine v9's TextInput/NativeSelect/Switch with their built-in label and error props, untouched single-file output.",
  genAntd:
    "The same Onboarding schema through --ui antd: Ant Design v6 bound as plain controlled components (no antd Form/Form.Item anywhere), untouched single-file output.",
  genLive:
    "formstand-gen --live --form-prop output: the page owns the form via the exported useFlightSearchForm() hook, and onValuesChange streams every keystroke into the values panel; no submit scaffold anywhere.",
  cliCommand:
    "Fill the options and the formstand-gen command updates live: the command line is useFormSelector-derived state.",
  schemaBuilder:
    "Design a schema and the real formstand-gen emitters regenerate the files on every keystroke, right in your browser.",
};

// Demos whose content is legitimately wide (Perf's autofill grid, the
// Schema builder's field rows + output viewer, the Invoice table, the live
// demo's form + values panel) skip the demo body's readable-measure cap.
const WIDE_DEMOS: ReadonlySet<TabKey> = new Set([
  "perf",
  "schemaBuilder",
  "muiInvoice",
  "genLive",
]);

const GROUP_TITLES: readonly GroupTitle[] = [
  "Core",
  "Patterns",
  "Material UI",
  "shadcn/ui",
  "Generated",
];

const GROUPS = GROUP_TITLES.map((title) => ({
  title,
  tabs: TAB_KEYS.filter((key) => GROUP_OF[key] === title).map((key) => ({
    key,
    label: DEMOS[key].label,
  })),
}));

// Every demo gets a direct link: the tab key in kebab-case after "#/"
// (e.g. #/schema-builder). Hash routing on purpose: the playground deploys
// to static GitHub Pages, where deep paths would 404 without server tricks.
const slugOf = (key: TabKey): string =>
  key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const KEY_BY_SLUG: Readonly<Record<string, TabKey>> = Object.fromEntries(
  TAB_KEYS.map((key) => [slugOf(key), key]),
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
  const current = DEMOS[active];
  const Demo = LAZY_DEMOS[active];
  const Wrapper = WRAPPERS[current.wrap];
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
                    <span className="nav-count">{group.tabs.length}</span>
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
        <DemoShell
          key={active}
          eyebrow={GROUP_OF[active]}
          title={current.label}
          blurb={BLURBS[active]}
          wide={WIDE_DEMOS.has(active)}
          files={DEMO_SOURCES[active]}
        >
          <Wrapper>
            <Demo />
          </Wrapper>
        </DemoShell>
      </div>
    </main>
  </div>
    </ThemeModeProvider>
  );
};
