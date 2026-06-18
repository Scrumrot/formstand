import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string().min(2, "min 2 chars"),
  age: z.number().nonnegative(),
});

describe("validateOnMount", () => {
  it("leaves the error map empty when not set", () => {
    const form = createForm(schema, {
      initialValues: { name: "", age: -1 },
    });
    expect(form.getState().errors).toEqual({});
  });

  it("populates the error map at creation for invalid initial values", () => {
    const form = createForm(schema, {
      initialValues: { name: "", age: -1 },
      validateOnMount: true,
    });
    const { errors } = form.getState();
    expect(errors.name).toEqual(["min 2 chars"]);
    expect(errors.age).toHaveLength(1);
  });

  it("leaves the error map empty when initial values are valid", () => {
    const form = createForm(schema, {
      initialValues: { name: "ok", age: 1 },
      validateOnMount: true,
    });
    expect(form.getState().errors).toEqual({});
  });

  it("does not mark fields touched or dirty", () => {
    const form = createForm(schema, {
      initialValues: { name: "", age: -1 },
      validateOnMount: true,
    });
    const state = form.getState();
    expect(state.touched).toEqual({});
    expect(state.dirty).toEqual({});
  });

  it("validates async schemas in the background", async () => {
    const asyncSchema = z.object({
      username: z
        .string()
        .refine(async (v) => v.length >= 3, { message: "too short" }),
    });
    const form = createForm(asyncSchema, {
      initialValues: { username: "a" },
      validateOnMount: true,
    });

    // Resolves asynchronously rather than throwing the sync-parse error.
    await vi.waitFor(() => {
      expect(form.getState().errors.username).toEqual(["too short"]);
    });
  });
});

describe("useIsValid-style error-map check", () => {
  // Mirrors how useIsValid reads the store: any non-empty error array => invalid.
  const hasNoErrors = (errors: Record<string, readonly string[]>): boolean =>
    Object.values(errors).every((e) => e.length === 0);

  it("reads as valid before validation even when values would fail", () => {
    const form = createForm(schema, {
      initialValues: { name: "", age: -1 },
    });
    expect(hasNoErrors(form.getState().errors)).toBe(true);
  });

  it("reads as invalid once validateOnMount has run on bad values", () => {
    const form = createForm(schema, {
      initialValues: { name: "", age: -1 },
      validateOnMount: true,
    });
    expect(hasNoErrors(form.getState().errors)).toBe(false);
  });
});
