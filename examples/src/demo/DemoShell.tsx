import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type { z } from "zod";
import type { Form } from "formstand";
import { StateDump } from "../forms/StateDump";

export type DemoShellProps = Readonly<{
  source: string;
  children: ReactNode;
}>;

// Demos register their live form through this context so the shell can
// render a uniform "View state" panel without each demo wiring one up.
const DemoFormContext = createContext<(form: unknown) => void>(() => {});

export const useDemoForm = (form: unknown): void => {
  const register = useContext(DemoFormContext);
  useEffect(() => {
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
      {children}
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
      {showCode ? (
        <pre className="state-dump" style={{ maxHeight: 480, overflow: "auto" }}>
          {source}
        </pre>
      ) : null}
    </DemoFormContext.Provider>
  );
};
