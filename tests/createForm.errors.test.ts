import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string().min(2),
  age: z.number().int(),
});

describe("form.setError", () => {
  it("writes errors at the given path", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    form.setError("name", ["server says no"]);
    expect(form.getState().errors["name"]).toEqual(["server says no"]);
  });

  it("clears the path when given an empty array", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    form.setError("name", ["first"]);
    form.setError("name", []);
    expect(form.getState().errors["name"]).toBeUndefined();
  });

  it("does not touch other fields' errors", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    form.setError("name", ["a"]);
    form.setError("age", ["b"]);
    expect(form.getState().errors).toEqual({ name: ["a"], age: ["b"] });
  });
});

describe("form.setErrors", () => {
  it("replaces the whole error map", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    form.setError("name", ["x"]);
    form.setErrors({ age: ["new"] });
    expect(form.getState().errors).toEqual({ age: ["new"] });
  });
});

describe("form.clearErrors", () => {
  it("clears one path when given a path", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    form.setError("name", ["a"]);
    form.setError("age", ["b"]);
    form.clearErrors("name");
    expect(form.getState().errors).toEqual({ age: ["b"] });
  });

  it("clears all errors when called with no argument", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    form.setError("name", ["a"]);
    form.setError("age", ["b"]);
    form.clearErrors();
    expect(form.getState().errors).toEqual({});
  });
});

describe("form.setMode / setReValidateMode", () => {
  it("changes mode in state", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    expect(form.getState().mode).toBe("onBlur");
    form.setMode("onChange");
    expect(form.getState().mode).toBe("onChange");
  });

  it("changes reValidateMode in state", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    expect(form.getState().reValidateMode).toBe("onChange");
    form.setReValidateMode("onSubmit");
    expect(form.getState().reValidateMode).toBe("onSubmit");
  });
});

describe("form.submit with throwing async refine", () => {
  it("resets isSubmitting even when validateAsync rejects unexpectedly", async () => {
    const explodingSchema = z.object({
      name: z.string().refine(
        async () => {
          throw new Error("boom from refine");
        },
        { message: "n/a" },
      ),
    });
    const form = createForm(explodingSchema, {
      initialValues: { name: "x" },
    });
    await expect(form.submit(() => {})).rejects.toThrow("boom from refine");
    expect(form.getState().isSubmitting).toBe(false);
  });
});
