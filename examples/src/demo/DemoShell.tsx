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

export type DemoShellProps = Readonly<{
  source: string;
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

export const DemoShell = ({ source, children }: DemoShellProps) => {
  const [form, setForm] = useState<unknown>(null);
  const [showState, setShowState] = useState(false);
  const [showCode, setShowCode] = useState(false);

  return (
    <DemoFormContext.Provider value={setForm}>
      <div className="demo-body">{children}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <button
          className="secondary"
          type="button"
          disabled={form === null}
          title={
            form === null ? "this demo hasn't registered its form" : undefined
          }
          onClick={() => setShowState((open) => !open)}
        >
          View state
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => setShowCode((open) => !open)}
        >
          View code
        </button>
      </div>
      {showState && form !== null ? (
        <StateDump form={form as Form<z.ZodType>} />
      ) : null}
      {showCode ? <CodeView source={source} /> : null}
    </DemoFormContext.Provider>
  );
};
