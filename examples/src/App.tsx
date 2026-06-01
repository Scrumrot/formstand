import { type ReactElement, useState } from "react";
import { ArrayForm } from "./forms/ArrayForm";
import { AsyncForm } from "./forms/AsyncForm";
import { BasicForm } from "./forms/BasicForm";
import { NestedForm } from "./forms/NestedForm";

type TabKey = "basic" | "nested" | "array" | "async";

type Tab = Readonly<{
  key: TabKey;
  label: string;
  render: () => ReactElement;
}>;

const TABS: readonly Tab[] = [
  { key: "basic", label: "Basic + modes", render: () => <BasicForm /> },
  { key: "nested", label: "Nested + submit", render: () => <NestedForm /> },
  { key: "array", label: "Field array", render: () => <ArrayForm /> },
  { key: "async", label: "Async validation", render: () => <AsyncForm /> },
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
      <div className="tabs">
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
