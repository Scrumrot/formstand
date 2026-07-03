import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string().min(2),
  email: z.email(),
  age: z.int().nonnegative(),
});

describe("form.validateFields", () => {
  it("validates only the listed paths and returns true when all valid", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", email: "t@t.com", age: -1 },
    });
    const ok = form.validateFields(["name", "email"]);
    expect(ok).toBe(true);
    expect(form.getState().errors).toEqual({});
  });

  it("returns false and writes errors for invalid listed paths only", () => {
    const form = createForm(schema, {
      initialValues: { name: "x", email: "bad", age: -1 },
    });
    const ok = form.validateFields(["name", "email"]);
    expect(ok).toBe(false);
    expect(form.getState().errors["name"]).toBeDefined();
    expect(form.getState().errors["email"]).toBeDefined();
    expect(form.getState().errors["age"]).toBeUndefined();
  });

  it("clears previously-existing errors for listed paths that are now valid", () => {
    const form = createForm(schema, {
      initialValues: { name: "x", email: "t@t.com", age: 1 },
    });
    form.validate();
    expect(form.getState().errors["name"]).toBeDefined();
    form.setValue("name", "Timothy");
    form.validateFields(["name"]);
    expect(form.getState().errors["name"]).toBeUndefined();
  });

  it("preserves errors at paths not in the list", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", email: "bad", age: -1 },
    });
    form.validate();
    expect(form.getState().errors["age"]).toBeDefined();
    form.setValue("email", "t@t.com");
    form.validateFields(["email"]);
    expect(form.getState().errors["email"]).toBeUndefined();
    expect(form.getState().errors["age"]).toBeDefined();
  });
});

describe("form.updateState", () => {
  it("merges partial state from the updater", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", email: "t@t.com", age: 30 },
    });
    form.updateState(() => ({
      touched: { name: true, email: true },
      serverErrors: { name: ["custom"] },
    }));
    expect(form.getState().touched).toEqual({ name: true, email: true });
    expect(form.getState().errors).toEqual({ name: ["custom"] });
    expect(form.getState().values).toEqual({
      name: "Tim",
      email: "t@t.com",
      age: 30,
    });
  });

  it("ignores a direct `errors` patch — the merged map is derived", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const form = createForm(schema, {
      initialValues: { name: "Tim", email: "t@t.com", age: 30 },
    });
    form.updateState(() => ({ errors: { name: ["custom"] } }));
    expect(form.getState().errors).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("form.reset with partial", () => {
  it("merges partial values over the current initialValues", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", email: "t@t.com", age: 30 },
    });
    form.reset({ name: "Jane" });
    expect(form.getState().values).toEqual({
      name: "Jane",
      email: "t@t.com",
      age: 30,
    });
    expect(form.getState().initialValues).toEqual(form.getState().values);
  });

  it("with no arg restores the stored initialValues", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", email: "t@t.com", age: 30 },
    });
    form.setValue("name", "Jane");
    form.reset();
    expect(form.getState().values.name).toBe("Tim");
  });
});
