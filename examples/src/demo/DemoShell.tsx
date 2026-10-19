import {
  type ReactNode,
  Suspense,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import type { z } from "zod";
import type { Form } from "formstand";
import { StateDump } from "../forms/StateDump";
import { CodeView } from "./CodeView";
import {
  type DemoFile,
  type DemoSourceFile,
  loadDemoFiles,
} from "./demoSources";
import { FileTree } from "./FileTree";
import { canOpenInStackBlitz, openInStackBlitz } from "./stackblitz";

export type DemoShellProps = Readonly<{
  // The demo's group title, name, and one-line description; the shell
  // renders them as the card header so every demo states what it shows.
  eyebrow: string;
  title: string;
  blurb: string;
  // Wide demos (grids, tables, side-by-side viewers) opt out of the
  // readable-measure cap on the demo body.
  wide?: boolean;
  files: readonly DemoSourceFile[];
  children: ReactNode;
}>;

// Demos register their live form through this context so the shell can
// render a uniform "View state" panel without each demo wiring one up.
// `unknown` on purpose: Form<TSchema>'s arrow-typed methods make concrete
// forms non-assignable to Form<z.ZodType> (contravariant params), so a typed
// channel would reject every real registration; the shell casts once where
// StateDump consumes it. Registration is a layout effect so the "View state"
// button never paints disabled for a frame after a tab switch.
const DemoFormContext = createContext<(form: unknown) => void>(() => {});

export const useDemoForm = (form: unknown): void => {
  const register = useContext(DemoFormContext);
  useLayoutEffect(() => {
    register(form);
    return () => {
      register(null);
    };
  }, [register, form]);
};

// The demo's source text, fetched on demand (the file LIST is static, the
// text lives in per-file chunks; see demoSources). Loaded when the shell
// mounts rather than when the code panel opens because the StackBlitz
// button needs the import graph to decide whether it may show at all; the
// cost is this one demo's own files, not the whole playground's.
type SourcesState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; files: readonly DemoFile[] }>;

// No cancellation on purpose: the shell is keyed by tab, so `files` never
// changes for a mounted shell, and a resolution after unmount is a no-op.
const useDemoSources = (files: readonly DemoSourceFile[]): SourcesState => {
  const [state, setState] = useState<SourcesState>({ kind: "loading" });
  useEffect(() => {
    void loadDemoFiles(files).then((loaded) =>
      setState({ kind: "ready", files: loaded }),
    );
  }, [files]);
  return state;
};

// Multi-file demos (the Onboarding module) open on hooks.ts, the file that
// explains the architecture, instead of alphabetical luck.
const defaultFilePath = (files: readonly DemoSourceFile[]): string =>
  files.find((file) => file.path === "hooks.ts")?.path ??
  files[0]?.path ??
  "";

type CodePanelProps = Readonly<{
  files: readonly DemoSourceFile[];
  sources: SourcesState;
}>;

const CodePanel = ({ files, sources }: CodePanelProps) => {
  const [selected, setSelected] = useState(() => defaultFilePath(files));
  const current =
    sources.kind === "ready"
      ? (sources.files.find((file) => file.path === selected) ??
        sources.files[0])
      : undefined;

  return (
    <div className="code-panel">
      {files.length > 1 ? (
        <div className="code-tree">
          <FileTree files={files} selected={selected} onSelect={setSelected} />
        </div>
      ) : null}
      {current !== undefined ? (
        <CodeView source={current.source} />
      ) : (
        <p className="demo-loading">Loading source...</p>
      )}
    </div>
  );
};

type Panel = "state" | "code";

// Sharing a demo is one tap: the hash routes make every tab a URL.
const CopyLinkButton = () => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="secondary icon-only"
      type="button"
      aria-label="copy link to this demo"
      title="copy link to this demo"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 14a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 1 0-6.4-6.4l-1.5 1.5" />
            <path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 1 0 6.4 6.4l1.5-1.5" />
          </g>
        </svg>
      )}
    </button>
  );
};

export const DemoShell = ({
  eyebrow,
  title,
  blurb,
  wide = false,
  files,
  children,
}: DemoShellProps) => {
  const [form, setForm] = useState<unknown>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const sources = useDemoSources(files);

  const toggle = (next: Panel) =>
    setPanel((current) => (current === next ? null : next));

  return (
    <DemoFormContext.Provider value={setForm}>
      <div className="card">
        <header className="demo-header">
          <div className="demo-heading">
            <span className="demo-eyebrow">{eyebrow}</span>
            <h2 className="demo-title">{title}</h2>
            <p className="demo-blurb">{blurb}</p>
          </div>
          <div className="demo-actions">
            {/* Toggle buttons: aria-pressed carries the open/closed state
                the .active class only paints. */}
            <button
              className={`secondary ${panel === "state" ? "active" : ""}`}
              type="button"
              aria-pressed={panel === "state"}
              disabled={form === null}
              title={
                form === null
                  ? "this demo hasn't registered its form"
                  : undefined
              }
              onClick={() => toggle("state")}
            >
              View state
            </button>
            <button
              className={`secondary ${panel === "code" ? "active" : ""}`}
              type="button"
              aria-pressed={panel === "code"}
              onClick={() => toggle("code")}
            >
              View code
            </button>
            {/* Only self-contained demos open standalone: kit demos import
                sibling adapters that are not part of their file set, so
                the button would hand StackBlitz a broken project. */}
            {sources.kind === "ready" && canOpenInStackBlitz(sources.files) ? (
              <button
                className="secondary"
                type="button"
                title="open this demo as a fresh StackBlitz project"
                onClick={() => openInStackBlitz(title, sources.files)}
              >
                StackBlitz
              </button>
            ) : null}
            <CopyLinkButton />
          </div>
        </header>
        <div className={`demo-split ${panel !== null ? "panel-open" : ""}`}>
          <div className={`demo-body${wide ? " wide" : ""}`}>
            {/* Demos are React.lazy chunks (App.tsx); this is the one
                boundary that catches them, so a tab switch paints the
                shell header at once and the body when its chunk lands. */}
            <Suspense
              fallback={<p className="demo-loading">Loading demo...</p>}
            >
              {children}
            </Suspense>
          </div>
          {panel !== null ? (
            <aside className="demo-panel">
              {/* The header toggles are out of reach behind the mobile
                  bottom sheet, so give the sheet its own close. */}
              <button
                className="secondary panel-close"
                type="button"
                onClick={() => setPanel(null)}
              >
                Close
              </button>
              {panel === "state" && form !== null ? (
                <StateDump form={form as Form<z.ZodType>} />
              ) : null}
              {panel === "code" ? (
                <CodePanel files={files} sources={sources} />
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>
    </DemoFormContext.Provider>
  );
};
