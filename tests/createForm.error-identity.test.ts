import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string().min(2, "too short"),
  age: z.number().nonnegative("negative"),
});

describe("error-array reference stability", () => {
  it("full validation with unchanged messages keeps the same error map", () => {
    const form = createForm(schema, { initialValues: { name: "x", age: -1 } });
    form.validate();
    const first = form.getState().errors;
    form.validate();
    expect(form.getState().errors).toBe(first);
    expect(form.getState().errors["name"]).toBe(first["name"]);
  });

  it("field validation keeps other entries' identity", () => {
    const form = createForm(schema, { initialValues: { name: "x", age: -1 } });
    form.validate();
    const ageErrors = form.getState().errors["age"];
    form.validateField("name");
    expect(form.getState().errors["age"]).toBe(ageErrors);
  });

  it("watchField does not re-fire when a revalidation reproduces the same error", () => {
    const form = createForm(schema, { initialValues: { name: "x", age: 1 } });
    form.validate();
    const fired: unknown[] = [];
    form.watchField("name", (snap) => {
      fired.push(snap);
    });
    form.validate();
    expect(fired).toHaveLength(0);
  });

  it("still updates identity when messages actually change", () => {
    const form = createForm(schema, { initialValues: { name: "x", age: -1 } });
    form.validate();
    const first = form.getState().errors;
    form.setValue("age", 3);
    form.validate();
    expect(form.getState().errors).not.toBe(first);
    expect(form.getState().errors["age"]).toBeUndefined();
    expect(form.getState().errors["name"]).toBe(first["name"]);
  });
});
