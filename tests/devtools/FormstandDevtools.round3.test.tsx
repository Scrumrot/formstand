import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { FormstandDevtools } from "../../src/devtools/FormstandDevtools";

// Regression pins for the third November 2026 review: non-finite numbers
// rendered as null in the fields table and the diff, and a held snapshot
// survived a form prop swap and restored into the new form.

afterEach(cleanup);

describe("FormstandDevtools round 3", () => {
  it("renders NaN and Infinity as their own spelling", () => {
    const schema = z.object({ n: z.number() });
    const form = createForm(schema, { initialValues: { n: Number.NaN } });
    render(<FormstandDevtools form={form} defaultOpen />);
    expect(screen.getByText("NaN")).toBeTruthy();
    act(() => {
      form.setValue("n", Number.POSITIVE_INFINITY);
    });
    expect(screen.getByText("Infinity")).toBeTruthy();
    expect(screen.getByText(/"n": "Infinity"/)).toBeTruthy();
    expect(screen.queryByText("null")).toBeNull();
  });

  it("forgets the held snapshot when the form prop changes", () => {
    const schema = z.object({ name: z.string() });
    const first = createForm(schema, { initialValues: { name: "ada" } });
    const second = createForm(schema, { initialValues: { name: "bob" } });
    const { rerender } = render(<FormstandDevtools form={first} defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: "snapshot" }));
    expect(screen.getByText("snapshot held")).toBeTruthy();
    rerender(<FormstandDevtools form={second} defaultOpen />);
    expect(screen.getByText("nothing held")).toBeTruthy();
    const restore = screen.getByRole("button", { name: "restore" });
    expect((restore as HTMLButtonElement).disabled).toBe(true);
    expect(second.getState().values.name).toBe("bob");
    // Swapping back finds the first form's snapshot again.
    rerender(<FormstandDevtools form={first} defaultOpen />);
    expect(screen.getByText("snapshot held")).toBeTruthy();
  });
});
