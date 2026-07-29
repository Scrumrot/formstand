// Render smoke test for the --live --form-prop playground demo: the
// generated FlightSearchForm.tsx (committed UNTOUCHED — regenerate via
// scripts/generate-cli-demos.mjs, CI diffs the output) mounted through the
// hand-written consumer page. The consumer's values panel renders ONLY what
// the generated component's onValuesChange callback delivers, so the panel
// reflecting a keystroke is the end-to-end proof of the live channel:
// page-owned form (useFlightSearchForm) → generated UI → watchValues →
// onValuesChange → panel.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlightSearchLive } from "../../examples/src/forms/FlightSearchLive";

// Any console.error — a key warning, a controlled/uncontrolled flip, an
// act() violation — is a generated-output bug; fail loudly on it.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("generated --live --form-prop demo (FlightSearchForm + consumer page)", () => {
  it("streams keystrokes into the values panel via onValuesChange", () => {
    render(
      <StrictMode>
        <FlightSearchLive />
      </StrictMode>,
    );

    // Seeded from the store before any change event fires.
    const panel = screen.getByLabelText("live form values");
    expect(panel.textContent).toContain('"origin": ""');

    // A text field: the panel updates per keystroke through the generated
    // component's watchValues subscription, not a render-side hook. origin
    // rides the config-fields autocomplete override, so it is a free-text
    // input WITH a native datalist of suggestions — typing works exactly as
    // before.
    const origin = screen.getByLabelText("Origin") as HTMLInputElement;
    fireEvent.change(origin, { target: { value: "KSEA" } });
    expect(origin.value).toBe("KSEA");
    expect(panel.textContent).toContain('"origin": "KSEA"');

    // The autocomplete override's suggestion plumbing: the input points at
    // its own datalist (list="origin-datalist"), and the datalist renders
    // the airport options the page passed through originOptions.
    expect(origin.getAttribute("list")).toBe("origin-datalist");
    const datalist = document.getElementById("origin-datalist");
    expect(datalist?.tagName).toBe("DATALIST");
    const values = [...(datalist?.querySelectorAll("option") ?? [])].map(
      (option) => option.value,
    );
    expect(values).toContain("KSEA");
    expect(values).toContain("KPDX");
    // Free text stays allowed: a value OUTSIDE the list still flows.
    fireEvent.change(origin, { target: { value: "ZZZZ" } });
    expect(panel.textContent).toContain('"origin": "ZZZZ"');

    // A number field: the parsed number (not its text) crosses the channel.
    const passengers = screen.getByLabelText("Passengers") as HTMLInputElement;
    fireEvent.change(passengers, { target: { value: "4" } });
    expect(panel.textContent).toContain('"passengers": 4');

    // cruiseAltitude's zod .describe("feet MSL") flows into the generated
    // helper line — the CLI's description mapping, visible in the DOM as
    // plain's muted zf-help paragraph under the control.
    const help = screen.getByText("feet MSL");
    expect(help.tagName).toBe("P");
    expect(help.className).toBe("zf-help");

    expect(console.error).not.toHaveBeenCalled();
  });

  it("emits no submit scaffold — a form landmark with no submit button", () => {
    render(
      <StrictMode>
        <FlightSearchLive />
      </StrictMode>,
    );

    // --live drops handleSubmit and the submit button entirely; the root
    // stays a <form> (label association, landmark) with a preventDefault
    // onSubmit so Enter cannot navigate the page.
    const form = document.querySelector("form");
    expect(form).not.toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(console.error).not.toHaveBeenCalled();
  });
});
