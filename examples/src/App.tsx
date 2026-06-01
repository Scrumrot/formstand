import { type ReactElement, useState } from "react";
import { ArrayForm } from "./forms/ArrayForm";
import { AsyncForm } from "./forms/AsyncForm";
import { BasicForm } from "./forms/BasicForm";
import { ConditionalForm } from "./forms/ConditionalForm";
import { InvoiceForm } from "./forms/InvoiceForm";
import { NestedForm } from "./forms/NestedForm";
import { ServerErrorsForm } from "./forms/ServerErrorsForm";
import { WizardForm } from "./forms/WizardForm";

type TabKey =
  | "basic"
  | "nested"
  | "array"
  | "async"
  | "wizard"
  | "conditional"
  | "invoice"
  | "server";

type Tab = Readonly<{
  key: TabKey;
  label: string;
  render: () => ReactElement;
}>;

const TABS: readonly Tab[] = [
  { key: "basic", label: "Basic + modes", render: () => <BasicForm /> },
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
    key: "server",
    label: "Server errors",
    render: () => <ServerErrorsForm />,
  },
];

export const App = () => {
  const [active, setActive] = useState<TabKey>("basic");
  const current = TABS.find((t) => t.key === active) ?? TABS[0];

  return (
    <div className="layout">
      <h1>zustand-forms</h1>
      <p className="subtitle">
        Local playground. Edit <code>src/</code> in the parent folder and
        changes hot-reload here.
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
      <div className="card">{current?.render()}</div>
    </div>
  );
};
