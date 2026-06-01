import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const userSchema = z.object({
  name: z.string(),
  age: z.number(),
  address: z.object({
    city: z.string(),
  }),
});

const makeForm = () =>
  createForm(userSchema, {
    initialValues: { name: "Tim", age: 30, address: { city: "NYC" } },
  });

describe("createForm", () => {
  it("initializes state from initialValues", () => {
    const form = makeForm();
    expect(form.getState().values).toEqual({
      name: "Tim",
      age: 30,
      address: { city: "NYC" },
    });
    expect(form.getState().initialValues).toEqual(form.getState().values);
    expect(form.getState().isSubmitting).toBe(false);
    expect(form.getState().submitCount).toBe(0);
    expect(form.getState().errors).toEqual({});
    expect(form.getState().dirty).toEqual({});
    expect(form.getState().touched).toEqual({});
  });

  it("setValue updates a top-level field", () => {
    const form = makeForm();
    form.setValue("name", "Jane");
    expect(form.getState().values.name).toBe("Jane");
  });

  it("setValue updates a nested field immutably", () => {
    const form = makeForm();
    const before = form.getState().values;
    form.setValue("address.city", "Boston");
    const after = form.getState().values;
    expect(after.address.city).toBe("Boston");
    expect(after).not.toBe(before);
    expect(after.address).not.toBe(before.address);
  });

  it("setValue marks the path as dirty", () => {
    const form = makeForm();
    form.setValue("name", "Jane");
    expect(form.getState().dirty["name"]).toBe(true);
  });

  it("setValues replaces the entire values object", () => {
    const form = makeForm();
    form.setValues({ name: "X", age: 1, address: { city: "Y" } });
    expect(form.getState().values).toEqual({
      name: "X",
      age: 1,
      address: { city: "Y" },
    });
  });

  it("reset restores initial values and clears meta", () => {
    const form = makeForm();
    form.setValue("name", "Jane");
    form.reset();
    expect(form.getState().values.name).toBe("Tim");
    expect(form.getState().dirty).toEqual({});
  });

  it("reset can adopt a new initial baseline", () => {
    const form = makeForm();
    form.reset({ name: "New", age: 5, address: { city: "LA" } });
    expect(form.getState().initialValues.name).toBe("New");
    expect(form.getState().values.name).toBe("New");
  });

  it("subscribe receives state updates", () => {
    const form = makeForm();
    const listener = vi.fn();
    const unsubscribe = form.subscribe(listener);
    form.setValue("name", "Jane");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    form.setValue("name", "Bob");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("exposes the original schema reference", () => {
    const form = makeForm();
    expect(form.schema).toBe(userSchema);
  });
});
