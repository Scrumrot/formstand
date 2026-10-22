// The starter template renders against the library SOURCE here (vitest
// aliases "formstand" onto src/), so a change that breaks the template's
// one form fails in the suite, not in a user's first `npm run dev`. CI also
// installs and builds the template against the PUBLISHED package, which is
// what a user actually gets; this test covers the next release.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../templates/vite-react/src/App";

afterEach(cleanup);

describe("starter template", () => {
  it("renders the signup form and reports a required field on submit", async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    const name = screen.getByLabelText("Name");
    expect(name.getAttribute("aria-invalid")).not.toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(name.getAttribute("aria-invalid")).toBe("true");
    });
    expect(screen.getByText("at least 2 characters")).toBeTruthy();
    expect(screen.getByText("you must accept the terms")).toBeTruthy();
  });
});
