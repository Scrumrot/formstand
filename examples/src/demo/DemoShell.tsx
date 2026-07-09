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

export const DemoShell = ({ files, children }: DemoShellProps) => {
  const [form, setForm] = useState<unknown>(null);
  const [panel, setPanel] = useState<Panel | null>(null);

  const toggle = (next: Panel) =>
    setPanel((current) => (current === next ? null : next));

  return (
    <DemoFormContext.Provider value={setForm}>
      <div className={`demo-split ${panel !== null ? "panel-open" : ""}`}>
        <div className="demo-body">{children}</div>
        <aside className="demo-panel">
          <div className="demo-panel-tabs">
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
          </div>
          {panel === "state" && form !== null ? (
            <StateDump form={form as Form<z.ZodType>} />
          ) : null}
          {panel === "code" ? <CodePanel files={files} /> : null}
        </aside>
      </div>
    </DemoFormContext.Provider>
  );
};
