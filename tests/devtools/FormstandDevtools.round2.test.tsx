import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { FormstandDevtools } from "../../src/devtools/FormstandDevtools";

// Regression pins for the second November 2026 review: the held snapshot
// used to live inside the open branch (lost on collapse), and the diff
// printed `{}` for a field cleared to undefined.

const schema = z.object({
  name: z.string().min(2, "too short"),
  nickname: z.string().optional(),
});

const makeForm = () =>
  createForm(schema, { initialValues: { name: "ada", nickname: "lovelace" } });

afterEach(cleanup);

describe("FormstandDevtools round 2", () => {
  it("keeps the held snapshot across a collapse", () => {
    const form = makeForm();
    render(<FormstandDevtools form={form} defaultOpen label="probe" />);
    fireEvent.click(screen.getByRole("button", { name: "snapshot" }));
    expect(screen.getByText("snapshot held")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByText("snapshot held")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /probe/ }));
    expect(screen.getByText("snapshot held")).toBeTruthy();

    act(() => {
      form.setValue("name", "grace");
    });
    const restore = screen.getByRole("button", { name: "restore" });
    expect((restore as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(restore);
    expect(form.getState().values.name).toBe("ada");
  });

  it("shows a field cleared to undefined in the diff", () => {
    const form = makeForm();
    render(<FormstandDevtools form={form} defaultOpen />);
    act(() => {
      form.setValue("nickname", undefined);
    });
    expect(screen.getByText(/"nickname": "undefined"/)).toBeTruthy();
  });
});
