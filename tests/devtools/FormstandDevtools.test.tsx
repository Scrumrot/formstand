import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { FormstandDevtools } from "../../src/devtools/FormstandDevtools";

const schema = z.object({
  name: z.string().min(2, "too short"),
  address: z.object({ city: z.string() }),
  tags: z.array(z.string()),
});

const makeForm = () =>
  createForm(schema, {
    initialValues: { name: "ada", address: { city: "London" }, tags: ["x"] },
  });

afterEach(cleanup);

describe("FormstandDevtools", () => {
  it("lists every leaf path once opened", () => {
    render(<FormstandDevtools form={makeForm()} defaultOpen />);
    expect(screen.getByText("name")).toBeTruthy();
    expect(screen.getByText("address.city")).toBeTruthy();
    expect(screen.getByText("tags.0")).toBeTruthy();
    // The header counts what the table shows.
    expect(screen.getByText("fields (3)")).toBeTruthy();
  });

  it("starts collapsed and opens on click", () => {
    render(<FormstandDevtools form={makeForm()} label="checkout" />);
    expect(screen.queryByText("address.city")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /checkout/ }));
    expect(screen.getByText("address.city")).toBeTruthy();
  });

  it("shows a field's error and marks it dirty after an edit", async () => {
    const form = makeForm();
    render(<FormstandDevtools form={form} defaultOpen />);
    await act(async () => {
      form.setValue("name", "a");
      await form.validate();
    });
    expect(screen.getByText("too short")).toBeTruthy();
    expect(screen.getByText(/dirty/)).toBeTruthy();
  });

  it("surfaces errors that belong to no field, including the root key", async () => {
    const rooted = createForm(
      z.object({ a: z.string() }).refine(() => false, "form is wrong"),
      { initialValues: { a: "" } },
    );
    render(<FormstandDevtools form={rooted} defaultOpen />);
    await act(async () => {
      await rooted.validate();
    });
    expect(screen.getByText("errors without a field")).toBeTruthy();
    expect(screen.getByText("(root)")).toBeTruthy();
    expect(screen.getByText("form is wrong")).toBeTruthy();
  });

  it("separates the server channel from the schema channel", () => {
    const form = makeForm();
    render(<FormstandDevtools form={form} defaultOpen />);
    act(() => {
      form.setError("name", "taken");
    });
    expect(screen.getByText(/schema 0 · server 1/)).toBeTruthy();
    // Twice on purpose: once on the field's own row, once in the channel
    // breakdown attributing it to the server channel rather than the schema.
    expect(screen.getAllByText("taken")).toHaveLength(2);
    expect(screen.getByText("(showing)")).toBeTruthy();
  });

  it("reads clean, then shows the diff once a value changes", () => {
    const form = makeForm();
    render(<FormstandDevtools form={form} defaultOpen />);
    expect(screen.getByText("clean")).toBeTruthy();
    act(() => {
      form.setValue("name", "grace");
    });
    expect(screen.getByText(/"name": "grace"/)).toBeTruthy();
  });

  it("restores a held snapshot", () => {
    const form = makeForm();
    render(<FormstandDevtools form={form} defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: "snapshot" }));
    act(() => {
      form.setValue("name", "grace");
    });
    expect(form.getField("name")).toBe("grace");
    fireEvent.click(screen.getByRole("button", { name: "restore" }));
    expect(form.getField("name")).toBe("ada");
  });

  it("renders nothing in a production build", () => {
    // The panel would otherwise leak the whole form state into a shipped page.
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(
      <FormstandDevtools form={makeForm()} defaultOpen />,
    );
    expect(container.innerHTML).toBe("");
    vi.unstubAllEnvs();
  });
});
