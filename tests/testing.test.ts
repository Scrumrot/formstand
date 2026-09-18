import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import {
  blurField,
  fillAndBlurField,
  fillField,
  fillFields,
  submitForm,
} from "../src/testing";

// formstand/testing drives a form the way the hooks drive it: the
// change/blur validation gates apply exactly as useField applies them, so
// a test sees what a rendered input would see — without mounting one.

const schema = z.object({
  email: z.string().email("not an email"),
  age: z.number().min(18, "adults only"),
});

const make = (mode?: "onChange" | "onBlur" | "onSubmit") =>
  createForm(schema, {
    initialValues: { email: "", age: 0 },
    ...(mode === undefined ? {} : { mode }),
  });

describe("fillField / blurField", () => {
  it("validates on change in onChange mode", () => {
    const form = make("onChange");
    fillField(form, "email", "nope");
    expect(form.getState().errors["email"]).toEqual(["not an email"]);
  });

  it("stays gate-silent on change in the default onBlur mode, then blur validates", () => {
    const form = make();
    fillField(form, "email", "nope");
    expect(form.getState().errors["email"]).toBeUndefined();
    blurField(form, "email");
    expect(form.getState().errors["email"]).toEqual(["not an email"]);
    expect(form.getState().touched["email"]).toBe(true);
  });

  it("a no-op write skips the gate entirely", () => {
    const form = make("onChange");
    fillField(form, "email", "same@example.com");
    const before = form.getState();
    fillField(form, "email", "same@example.com");
    expect(form.getState()).toBe(before);
  });

  it("fillAndBlurField is the edit-then-leave a user performs", () => {
    const form = make();
    fillAndBlurField(form, "age", 12);
    expect(form.getState().errors["age"]).toEqual(["adults only"]);
    expect(form.getState().touched["age"]).toBe(true);
  });

  it("type-checks the value against the path", () => {
    const form = make();
    // @ts-expect-error age is a number, not a string
    fillField(form, "age", "twelve");
    // @ts-expect-error "nope" is not a schema path
    fillField(form, "nope", 1);
  });
});

describe("fillFields", () => {
  it("applies every entry through the full fill recipe, in order", () => {
    const form = make("onChange");
    fillFields(form, { email: "tim@example.com", age: 44 });
    expect(form.getState().values).toEqual({
      email: "tim@example.com",
      age: 44,
    });
    expect(form.getState().errors["email"]).toBeUndefined();
  });
});

describe("submitForm", () => {
  it("resolves valid with the parsed data", async () => {
    const form = make();
    fillFields(form, { email: "tim@example.com", age: 44 });
    const result = await submitForm(form);
    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.data).toEqual({ email: "tim@example.com", age: 44 });
    }
  });

  it("resolves invalid with the errors written and fields touched", async () => {
    const form = make();
    const result = await submitForm(form);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors["email"]).toEqual(["not an email"]);
    }
    expect(form.getState().touched["email"]).toBe(true);
  });
});
