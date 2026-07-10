import {
  type ReactNode,
  createContext,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import type { z } from "zod";
import type { Form } from "formstand";
import { StateDump } from "../forms/StateDump";
import { CodeView } from "./CodeView";
import type { DemoFile } from "./demoSources";
import { FileTree } from "./FileTree";

export type DemoShellProps = Readonly<{
  // The demo's group title, name, and one-line description — the shell
  // renders them as the card header so every demo states what it shows.
  eyebrow: string;
  title: string;
  blurb: string;
  files: readonly DemoFile[];
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

// Multi-file demos (the Onboarding module) open on hooks.ts — the file that
// explains the architecture — instead of alphabetical luck.
const defaultFilePath = (files: readonly DemoFile[]): string =>
  files.find((file) => file.path === "hooks.ts")?.path ??
  files[0]?.path ??
  "";

const CodePanel = ({ files }: Readonly<{ files: readonly DemoFile[] }>) => {
  const [selected, setSelected] = useState(() => defaultFilePath(files));
  const current = files.find((file) => file.path === selected) ?? files[0];

  return (
    <div className="code-panel">
      {files.length > 1 ? (
        <div className="code-tree">
          <FileTree files={files} selected={selected} onSelect={setSelected} />
        </div>
      ) : null}
      {current !== undefined ? <CodeView source={current.source} /> : null}
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
  files,
  children,
}: DemoShellProps) => {
  const [form, setForm] = useState<unknown>(null);
  const [panel, setPanel] = useState<Panel | null>(null);

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
            <button
              className={`secondary ${panel === "state" ? "active" : ""}`}
              type="button"
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
              onClick={() => toggle("code")}
            >
              View code
            </button>
            <CopyLinkButton />
          </div>
        </header>
        <div className={`demo-split ${panel !== null ? "panel-open" : ""}`}>
          <div className="demo-body">{children}</div>
          {panel !== null ? (
            <aside className="demo-panel">
              {/* The header toggles are out of reach behind the mobile
                  bottom sheet — give the sheet its own close. */}
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
              {panel === "code" ? <CodePanel files={files} /> : null}
            </aside>
          ) : null}
        </div>
      </div>
    </DemoFormContext.Provider>
  );
};
