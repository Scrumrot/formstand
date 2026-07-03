import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string().min(2),
  age: z.number(),
});

const makeDirtyForm = async () => {
  const form = createForm(schema, { initialValues: { name: "x", age: 1 } });
  form.setValue("age", 2);
  form.setTouched("age");
  await form.submit(() => {}); // invalid (name too short) → errors + submitCount
  return form;
};

describe("reset options", () => {
  it("plain reset wipes everything", async () => {
    const form = await makeDirtyForm();
    form.reset();
    const state = form.getState();
    expect(state.errors).toEqual({});
    expect(state.touched).toEqual({});
    expect(state.dirty).toEqual({});
    expect(state.submitCount).toBe(0);
  });

  it("keepErrors / keepTouched / keepSubmitCount preserve slices", async () => {
    const form = await makeDirtyForm();
    form.reset(undefined, {
      keepErrors: true,
      keepTouched: true,
      keepSubmitCount: true,
    });
    const state = form.getState();
    expect(state.errors["name"]).toBeDefined();
    expect(state.touched["age"]).toBe(true);
    expect(state.submitCount).toBe(1);
    // Values still reset, and dirtiness always clears with them — a field
    // whose value equals its initial value is clean by definition.
    expect(state.values).toEqual({ name: "x", age: 1 });
    expect(state.dirty).toEqual({});
    expect(form.getFieldState("age").dirty).toBe(false);
  });

  it("replaces wholesale for array-rooted schemas instead of spreading", () => {
    const arraySchema = z.array(z.string());
    const form = createForm(arraySchema, { initialValues: ["a", "b"] });
    form.reset(["c"] as never);
    expect(form.getState().values).toEqual(["c"]);
    expect(Array.isArray(form.getState().values)).toBe(true);
  });
});

describe("resetField", () => {
  it("restores the initial value and clears the field's meta", async () => {
    const form = await makeDirtyForm();
    form.resetField("age");
    const state = form.getState();
    expect(state.values.age).toBe(1);
    expect(state.touched["age"]).toBeUndefined();
    expect(state.dirty["age"]).toBeUndefined();
    // Other fields' state is untouched.
    expect(state.errors["name"]).toBeDefined();
    expect(state.submitCount).toBe(1);
  });

  it("clears descendant meta for object paths", () => {
    const nested = z.object({
      address: z.object({ city: z.string().min(1) }),
    });
    const form = createForm(nested, {
      initialValues: { address: { city: "NYC" } },
    });
    form.setValue("address.city", "");
    form.validateField("address.city");
    expect(form.getState().errors["address.city"]).toBeDefined();
    form.resetField("address");
    expect(form.getState().values.address.city).toBe("NYC");
    expect(form.getState().errors).toEqual({});
    expect(form.getState().dirty).toEqual({});
  });
});
