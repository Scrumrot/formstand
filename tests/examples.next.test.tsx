// The Next.js example's client form, rendered against the library SOURCE
// (vitest aliases "formstand" onto src/). The server action is a plain
// module here, so the whole round trip runs in-process: the browser-side
// parse that stops an invalid submit before the action, and the action's
// own re-parse plus its verdict. CI builds the app against the PUBLISHED
// formstand with `next build`; this test covers the next release.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { saveSignup } from "../examples/next/app/actions";
import { SignupForm } from "../examples/next/app/SignupForm";
import { initialSaveState } from "../examples/next/app/schema";

afterEach(cleanup);

describe("Next.js example: SignupForm with a server action", () => {
  it("an invalid submit writes field errors and never reaches the action", async () => {
    render(
      <StrictMode>
        <SignupForm />
      </StrictMode>,
    );
    fireEvent.submit(screen.getByRole("button", { name: "Sign up" }).closest("form") as HTMLFormElement);
    await waitFor(() => {
      expect(screen.getByText("at least 2 characters")).toBeTruthy();
    });
    expect(screen.getByRole("status").textContent).toBe("nothing saved yet");
  });

  it("a valid submit runs the action and shows its verdict", async () => {
    render(
      <StrictMode>
        <SignupForm />
      </StrictMode>,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@lovelace.dev" } });
    fireEvent.click(screen.getByLabelText("I accept the terms"));
    fireEvent.submit(screen.getByRole("button", { name: "Sign up" }).closest("form") as HTMLFormElement);
    await waitFor(
      () => {
        expect(screen.getByRole("status").textContent).toContain("welcome, Ada (starter)");
      },
      { timeout: 3_000 },
    );
    expect(screen.getByRole("status").getAttribute("data-status")).toBe("saved");
  });
});

describe("Next.js example: the server action re-parses its payload", () => {
  it("refuses a payload the schema rejects, whatever the client claimed", async () => {
    const verdict = await saveSignup(initialSaveState, { name: "x", email: "nope", plan: "starter", terms: true });
    expect(verdict.status).toBe("rejected");
    expect(verdict.message).toBe("the server refused the payload");
    expect(verdict.saves).toBe(0);
  });

  it("rejects the example domain and saves anything else", async () => {
    const rejected = await saveSignup(initialSaveState, {
      name: "Ada",
      email: "ada@example.com",
      plan: "pro",
      terms: true,
    });
    expect(rejected.status).toBe("rejected");
    const saved = await saveSignup(rejected, {
      name: "Ada",
      email: "ada@lovelace.dev",
      plan: "pro",
      terms: true,
    });
    expect(saved).toEqual({ status: "saved", message: "welcome, Ada (pro)", saves: 1 });
  });
});
