// Behavior pins for the playground fixes of review round C (2026-10): the
// demos render here against the library source (vitest aliases "formstand"
// onto src/), so each fix is asserted on real DOM rather than on markup.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveForm } from "../examples/src/forms/AutosaveForm";
import { BasicForm } from "../examples/src/forms/BasicForm";
import { ConditionalForm } from "../examples/src/forms/ConditionalForm";
import { CliCommandBuilder } from "../examples/src/forms/CliCommandBuilder";
import { OnboardingForm } from "../examples/src/forms/OnboardingForm/OnboardingForm";
import { onboardingForm } from "../examples/src/forms/OnboardingForm/hooks";
import { SchemaBuilder } from "../examples/src/forms/SchemaBuilder/SchemaBuilder";
import { DemoShell } from "../examples/src/demo/DemoShell";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const renderStrict = (ui: React.ReactElement) =>
  render(<StrictMode>{ui}</StrictMode>);

// Reads the element an input's aria-describedby points at, or null when the
// attribute is absent or dangling.
const describedBy = (input: HTMLElement): HTMLElement | null => {
  const id = input.getAttribute("aria-describedby");
  return id === null ? null : document.getElementById(id);
};

describe("Conditional demo: discriminated union submit payload", () => {
  it("submits only the active branch after switching payment method", async () => {
    renderStrict(<ConditionalForm />);

    // Type into the card branch, then switch to bank: the card text must not
    // survive in state (the flat-object version kept it and submitted it).
    fireEvent.change(screen.getByLabelText("Card number"), {
      target: { value: "1234" },
    });
    fireEvent.change(screen.getByLabelText("Payment method"), {
      target: { value: "bank" },
    });
    fireEvent.change(screen.getByLabelText("Account number"), {
      target: { value: "12345678" },
    });
    fireEvent.change(screen.getByLabelText("Routing number"), {
      target: { value: "123456789" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));

    const status = await screen.findByRole("status");
    const payload = JSON.parse(
      status.querySelector("code")?.textContent ?? "{}",
    ) as Record<string, unknown>;
    expect(payload).toEqual({
      paymentMethod: "bank",
      accountNumber: "12345678",
      routingNumber: "123456789",
    });
    expect(payload).not.toHaveProperty("cardNumber");
  });

  it("validates the active branch and wires its errors to the inputs", async () => {
    renderStrict(<ConditionalForm />);
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));

    const cardNumber = screen.getByLabelText("Card number");
    await waitFor(() => {
      expect(cardNumber.getAttribute("aria-invalid")).toBe("true");
    });
    expect(describedBy(cardNumber)?.textContent).toBe("16 digits required");
    // focusFirstError ran in the invalid handler: the first errored control
    // holds focus.
    expect(document.activeElement).toBe(cardNumber);
  });
});

describe("hand-rolled demos: error wiring after a failed submit", () => {
  it("BasicForm marks the first errored input invalid, describes it, and focuses it", async () => {
    renderStrict(<BasicForm />);
    const name = screen.getByLabelText("Name");
    const email = screen.getByLabelText("Email");

    // Before submit: no error shows, so nothing is described (the bound
    // components follow the same rule; a dangling description is noise).
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(name.getAttribute("aria-describedby")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(name.getAttribute("aria-invalid")).toBe("true");
    });
    const message = describedBy(name);
    expect(message?.textContent).toBe("name must be at least 2 chars");
    expect(message?.getAttribute("aria-live")).toBe("polite");
    expect(describedBy(email)?.textContent).toBe("must be a valid email");
    expect(document.activeElement).toBe(name);
  });
});

describe("Autosave demo: status after restoring a draft", () => {
  it("reports the restored draft instead of unsaved changes", () => {
    localStorage.setItem(
      "formstand:autosave-demo",
      JSON.stringify({ title: "Restored", body: "From storage" }),
    );
    renderStrict(<AutosaveForm />);
    expect(screen.getByRole("status").textContent).toBe("Draft restored");
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "Restored");
  });

  it("reports no draft on a blank start", () => {
    renderStrict(<AutosaveForm />);
    expect(screen.getByRole("status").textContent).toBe("No draft");
  });
});

describe("DemoShell: panel toggles expose their pressed state", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#/");
  });

  it("flips aria-pressed on View code", async () => {
    renderStrict(
      <DemoShell
        eyebrow="Core"
        title="Test"
        blurb="A shell under test."
        files={[{ path: "Demo.tsx", load: () => Promise.resolve("// demo") }]}
      >
        <p>demo body</p>
      </DemoShell>,
    );
    const code = screen.getByRole("button", { name: "View code" });
    const state = screen.getByRole("button", { name: "View state" });
    expect(code.getAttribute("aria-pressed")).toBe("false");
    expect(state.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(code);
    expect(code.getAttribute("aria-pressed")).toBe("true");
    // The source text is fetched on demand; the panel shows it once loaded.
    await waitFor(() => {
      expect(document.querySelector("pre.state-dump")?.textContent).toContain(
        "// demo",
      );
    });
    fireEvent.click(code);
    expect(code.getAttribute("aria-pressed")).toBe("false");
  });
});

// The two demos round C left on bare error spans: the Onboarding module's
// per-field files (a createFormHooks singleton, hence the reset) and the
// CLI command builder (onChange mode, no submit button).
describe("module and builder demos: error wiring", () => {
  afterEach(() => {
    onboardingForm.reset();
  });

  it("OnboardingForm describes a required field after a failed submit", async () => {
    renderStrict(<OnboardingForm />);
    const firstName = screen.getByLabelText("First name");
    expect(firstName.getAttribute("aria-describedby")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Complete onboarding" }));

    await waitFor(() => {
      expect(firstName.getAttribute("aria-invalid")).toBe("true");
    });
    const message = describedBy(firstName);
    expect(message?.textContent).toBe("required");
    expect(message?.getAttribute("aria-live")).toBe("polite");
    expect(describedBy(screen.getByLabelText("Personal email"))?.textContent).toBe(
      "valid email required",
    );
  });

  it("OnboardingForm describes an emergency contact row field by its path", async () => {
    renderStrict(<OnboardingForm />);
    // The initial values seed one empty contact row.
    const contactName = screen.getByLabelText("Contact name");
    expect(contactName.id).toBe("emergencyContacts.0.name");

    fireEvent.click(screen.getByRole("button", { name: "Complete onboarding" }));

    await waitFor(() => {
      expect(describedBy(contactName)?.textContent).toBe("required");
    });
  });

  it("CliCommandBuilder describes the input file once it is cleared", async () => {
    renderStrict(<CliCommandBuilder />);
    const input = screen.getByLabelText("Input file");
    expect(input.getAttribute("aria-describedby")).toBeNull();

    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });
    expect(describedBy(input)?.textContent).toBe(
      "point it at a schema or types file",
    );
  });
});

// The Schema builder validates onChange and has no submit button, like the
// CLI command builder; its field rows are addressed by path so both row
// levels (top-level fields and section fields) get unique ids.
describe("Schema builder: error wiring", () => {
  it("describes the component name once it is cleared", async () => {
    renderStrict(<SchemaBuilder />);
    const input = screen.getByLabelText("Component name");
    expect(input.getAttribute("aria-describedby")).toBeNull();

    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });
    const message = describedBy(input);
    expect(message?.textContent).toBe("name the component");
    expect(message?.getAttribute("aria-live")).toBe("polite");
  });

  it("describes a field row's name by its path", async () => {
    renderStrict(<SchemaBuilder />);
    // The worked example seeds two top-level fields and two sections.
    const names = screen.getAllByLabelText("field name");
    const first = names[0] as HTMLElement;
    expect(first.id).toBe("rootFields.0.name");
    expect(names.map((input) => input.id)).toContain("sections.0.fields.0.name");

    fireEvent.change(first, { target: { value: "" } });

    await waitFor(() => {
      expect(describedBy(first)?.textContent).toBe("needs a name");
    });
  });

  it("announces a section left without fields", async () => {
    renderStrict(<SchemaBuilder />);
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      " ",
      " ",
    ]);

    // Row remove buttons in DOM order: two top-level rows, then the address
    // section's three. Removing index 2 three times empties that section.
    const removeAt = (index: number) =>
      fireEvent.click(screen.getAllByRole("button", { name: "✕" })[index] as HTMLElement);
    removeAt(2);
    removeAt(2);
    removeAt(2);

    await waitFor(() => {
      expect(screen.getAllByRole("alert")[0]?.textContent).toBe(
        "a section needs at least one field",
      );
    });
  });
});
