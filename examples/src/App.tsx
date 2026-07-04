import { type ReactElement, useState } from "react";
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

type TabKey =
  | "basic"
  | "bound"
  | "context"
  | "nested"
  | "array"
  | "async"
  | "wizard"
  | "conditional"
  | "invoice"
  | "nestedArrays"
  | "server"
  | "autosave"
  | "dependent"
  | "optimistic"
  | "file"
  | "derived"
  | "tag"
  | "perf";

type Tab = Readonly<{
  key: TabKey;
  label: string;
  render: () => ReactElement;
}>;

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
];

export const App = () => {
  const [active, setActive] = useState<TabKey>("basic");
  const current = TABS.find((t) => t.key === active) ?? TABS[0];

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
      <div className="card">{current?.render()}</div>
    </div>
  );
};
