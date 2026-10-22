// The devtools playground tab: the panel must show in the deployed
// playground, which is a production build where FormstandDevtools renders
// nothing by default. The demo opts in with `enabled`, so the tab is
// rendered here under a production NODE_ENV and asserted on the panel's
// own DOM, not on the gate's happy path.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevtoolsDemo } from "../examples/src/forms/DevtoolsDemo";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("Devtools demo under a production build", () => {
  it("shows the panel open with the form's field rows", () => {
    vi.stubEnv("NODE_ENV", "production");
    render(
      <StrictMode>
        <DevtoolsDemo />
      </StrictMode>,
    );
    expect(screen.getByText("fields (5)")).toBeTruthy();
    expect(screen.getByText("tags.0")).toBeTruthy();
  });

  it("the written server error reaches the panel's channel count", async () => {
    vi.stubEnv("NODE_ENV", "production");
    render(
      <StrictMode>
        <DevtoolsDemo />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Write a server error" }));
    await waitFor(() => {
      // The field shows it and the panel's fields table lists it once more.
      expect(screen.getAllByText("already registered").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("the root refine lands in the panel as an error without a field", async () => {
    vi.stubEnv("NODE_ENV", "production");
    render(
      <StrictMode>
        <DevtoolsDemo />
      </StrictMode>,
    );
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getAllByText("admins must receive the newsletter").length,
      ).toBeGreaterThanOrEqual(2);
    });
  });
});
