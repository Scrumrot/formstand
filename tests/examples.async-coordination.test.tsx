// The Async demo as the recipe's working example: two fields with their own
// debounced async refines, one form-level "checking" line from
// useIsValidating(form), and a submit gated on it. Real timers: the demo's
// delays are 300 ms debounce plus 600/900 ms checks, well inside waitFor's
// ceiling here, and fake timers would also freeze the library's debouncer.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AsyncForm } from "../examples/src/forms/AsyncForm";

afterEach(cleanup);

describe("Async demo: several checks at once", () => {
  it("reports the form as checking while either field is in flight and gates the submit", async () => {
    render(
      <StrictMode>
        <AsyncForm />
      </StrictMode>,
    );
    const status = screen.getByTestId("form-validating");
    const submit = screen.getByRole("button", { name: "Sign up" });
    expect(status.textContent?.trim()).toBe("");
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "root" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });

    // The debounce fires, both passes start, the form-level line turns on
    // and the submit is held.
    await waitFor(
      () => {
        expect(status.textContent).toBe("checking the form...");
      },
      { timeout: 2_000 },
    );
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    // Both verdicts land on their own paths; the line clears only when the
    // slower one (email) has settled, and the submit is released.
    await waitFor(
      () => {
        expect(screen.getByText("that username is taken")).toBeTruthy();
        expect(screen.getByText("example.com addresses are not accepted")).toBeTruthy();
      },
      { timeout: 4_000 },
    );
    await waitFor(() => {
      expect(status.textContent?.trim()).toBe("");
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  }, 10_000);
});
