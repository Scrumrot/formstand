import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  items: z.array(z.object({ name: z.string().min(1) })),
  title: z.string(),
});

const makeForm = () =>
  createForm(schema, {
    initialValues: { items: [{ name: "a" }], title: "t" },
  });

describe("form.resetField", () => {
  it("restores a field that has an initial counterpart", () => {
    const form = makeForm();
    form.setValue("items.0.name", "changed");
    form.resetField("items.0.name");
    expect(form.getState().values.items[0]?.name).toBe("a");
  });

  // Regression (2026-07 review #2): a path with no counterpart slot in
  // initialValues (an appended array row) must not be "reset" by writing
  // undefined into the values tree — that left a [rowA, undefined] hole
  // that crashed row renders and failed the schema.
  it("leaves an appended row's value intact instead of writing an undefined hole", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const form = makeForm();
    form.arrayPush("items", { name: "b" });
    form.resetField("items.1");
    expect(form.getState().values.items).toEqual([
      { name: "a" },
      { name: "b" },
    ]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("still clears error/touched state for the appended row it leaves in place", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const form = makeForm();
    form.arrayPush("items", { name: "" });
    form.setTouched("items.1.name", true);
    form.validateField("items.1.name");
    expect(form.getState().errors["items.1.name"]).toBeDefined();

    form.resetField("items.1");
    expect(form.getState().errors["items.1.name"]).toBeUndefined();
    expect(form.getState().touched["items.1.name"]).toBeUndefined();
    // The row itself survives untouched.
    expect(form.getState().values.items[1]).toEqual({ name: "" });
    warn.mockRestore();
  });

  it("a leaf that is legitimately undefined in initialValues still resets", () => {
    const optionalSchema = z.object({ note: z.string().optional() });
    const form = createForm(optionalSchema, { initialValues: {} });
    form.setValue("note", "typed");
    form.resetField("note");
    // The slot exists on the initial record (empty object root), so the
    // reset writes the initial undefined back rather than warning.
    expect(form.getState().values.note).toBeUndefined();
  });
});
