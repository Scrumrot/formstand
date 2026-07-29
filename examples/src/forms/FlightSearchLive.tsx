import { useState } from "react";
import { useDemoForm } from "../demo/DemoShell";
import {
  FlightSearchForm,
  useFlightSearchForm,
} from "../generated/FlightSearchForm";

// The consumer page for the generated `--live --form-prop` demo. This file
// is hand-written; FlightSearchForm.tsx next to the schema is UNTOUCHED CLI
// output. The two flags compose into the page-owned live form: the page
// creates the instance with the exported useFlightSearchForm() hook, hands
// it to the generated component via the `form` prop, and the values panel
// is fed exclusively by `onValuesChange` — the generated component's
// form.watchValues subscription, not a render-side hook — so the JSON dump
// updating per keystroke IS the proof that the live channel works. One
// instance, two consumers, no submit anywhere: the twin's map-driven case
// in miniature.

export const FlightSearchLive = () => {
  const form = useFlightSearchForm();
  useDemoForm(form);
  // Seeded from the store, then written only by onValuesChange.
  const [values, setValues] = useState(() => form.getState().values);

  return (
    <div>
      <p className="subtitle">
        The form is <code>formstand-gen --live --form-prop</code> output: no
        submit scaffold — the component takes the page-owned <code>form</code>{" "}
        and streams every value change out through{" "}
        <code>onValuesChange</code>. The panel on the right renders only what
        that callback delivers: type anywhere and it updates per keystroke.
      </p>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <FlightSearchForm form={form} onValuesChange={setValues} />
        </div>
        <pre
          className="command-line"
          aria-label="live form values"
          style={{ flex: 1, margin: 0, whiteSpace: "pre-wrap" }}
        >
          {JSON.stringify(values, null, 2)}
        </pre>
      </div>
    </div>
  );
};
