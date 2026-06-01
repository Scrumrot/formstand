import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const userSchema = z.object({
  name: z.string().min(2),
  age: z.int().nonnegative(),
  address: z.object({ city: z.string().min(1) }),
});

const passwordSchema = z
  .object({ password: z.string().min(8), confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "must match password",
  });

describe("form.validate", () => {
  it("returns valid for good input and clears errors", () => {
    const form = createForm(userSchema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" } },
    });
    form.setValue("name", "x");
    form.validateField("name");
    expect(form.getState().errors["name"]).toBeDefined();

    form.setValue("name", "Timothy");
    const result = form.validate();
    expect(result.kind).toBe("valid");
    expect(form.getState().errors).toEqual({});
  });

  it("returns invalid with full error map and writes it to state", () => {
    const form = createForm(userSchema, {
      initialValues: {
        name: "x",
        age: -1,
        address: { city: "" },
      },
    });
    const result = form.validate();
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error();
    expect(result.errors["name"]).toBeDefined();
    expect(result.errors["age"]).toBeDefined();
    expect(result.errors["address.city"]).toBeDefined();
    expect(form.getState().errors).toEqual(result.errors);
  });
});

describe("form.validateField", () => {
  it("writes only that field's errors to state", () => {
    const form = createForm(userSchema, {
      initialValues: {
        name: "x",
        age: -1,
        address: { city: "" },
      },
    });
    const result = form.validateField("name");
    expect(result.kind).toBe("invalid");
    expect(Object.keys(form.getState().errors)).toEqual(["name"]);
  });

  it("clears that field's error when it becomes valid", () => {
    const form = createForm(userSchema, {
      initialValues: { name: "x", age: 30, address: { city: "NYC" } },
    });
    form.validateField("name");
    expect(form.getState().errors["name"]).toBeDefined();

    form.setValue("name", "Timothy");
    const result = form.validateField("name");
    expect(result.kind).toBe("valid");
    expect(form.getState().errors["name"]).toBeUndefined();
  });

  it("preserves other fields' errors when validating one field", () => {
    const form = createForm(userSchema, {
      initialValues: { name: "x", age: -1, address: { city: "NYC" } },
    });
    form.validate();
    expect(form.getState().errors["name"]).toBeDefined();
    expect(form.getState().errors["age"]).toBeDefined();

    form.setValue("name", "Timothy");
    form.validateField("name");
    expect(form.getState().errors["name"]).toBeUndefined();
    expect(form.getState().errors["age"]).toBeDefined();
  });

  it("surfaces cross-field refinement errors on the targeted path", () => {
    const form = createForm(passwordSchema, {
      initialValues: { password: "longenough", confirm: "different" },
    });
    const result = form.validateField("confirm");
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors["confirm"]).toEqual(["must match password"]);
  });
});

describe("form.reset clears errors", () => {
  it("clears errors after reset", () => {
    const form = createForm(userSchema, {
      initialValues: { name: "x", age: -1, address: { city: "" } },
    });
    form.validate();
    expect(Object.keys(form.getState().errors).length).toBeGreaterThan(0);
    form.reset();
    expect(form.getState().errors).toEqual({});
  });
});
