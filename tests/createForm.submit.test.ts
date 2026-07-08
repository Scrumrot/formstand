import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string().min(2),
  age: z.int().nonnegative(),
});

const validValues = { name: "Tim", age: 30 };
const invalidValues = { name: "x", age: -1 };

describe("form.submit", () => {
  it("calls onValid with parsed output when input is valid", async () => {
    const form = createForm(schema, { initialValues: validValues });
    const onValid = vi.fn();
    await form.submit(onValid);
    expect(onValid).toHaveBeenCalledWith(validValues);
  });

  it("calls onInvalid with the error map when input is invalid", async () => {
    const form = createForm(schema, { initialValues: invalidValues });
    const onValid = vi.fn();
    const onInvalid = vi.fn();
    await form.submit(onValid, onInvalid);
    expect(onValid).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledOnce();
    expect(onInvalid.mock.calls[0]?.[0]).toMatchObject({ name: expect.any(Array) });
  });

  it("writes errors to state on invalid submit", async () => {
    const form = createForm(schema, { initialValues: invalidValues });
    await form.submit(() => {});
    expect(form.getState().errors["name"]).toBeDefined();
    expect(form.getState().errors["age"]).toBeDefined();
  });

  it("clears errors on valid submit", async () => {
    const form = createForm(schema, { initialValues: invalidValues });
    await form.submit(() => {});
    expect(Object.keys(form.getState().errors).length).toBeGreaterThan(0);

    form.setValues(validValues);
    await form.submit(() => {});
    expect(form.getState().errors).toEqual({});
  });

  it("increments submitCount on every attempt", async () => {
    const form = createForm(schema, { initialValues: invalidValues });
    await form.submit(() => {});
    await form.submit(() => {});
    expect(form.getState().submitCount).toBe(2);
  });

  it("toggles isSubmitting during an async handler", async () => {
    const form = createForm(schema, { initialValues: validValues });
    let observedDuring = false;
    await form.submit(async () => {
      observedDuring = form.getState().isSubmitting;
      await Promise.resolve();
    });
    expect(observedDuring).toBe(true);
    expect(form.getState().isSubmitting).toBe(false);
  });

  it("resets isSubmitting even if the handler throws (resolving kind 'error')", async () => {
    const form = createForm(schema, { initialValues: validValues });
    // A throwing onValid resolves { kind: "error", error } rather than
    // rejecting, so handleSubmit-as-event-handler never leaves an unhandled
    // rejection.
    const result = await form.submit(() => {
      throw new Error("boom");
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error();
    expect(result.error).toBeInstanceOf(Error);
    expect(form.getState().isSubmitting).toBe(false);
  });

  it("resets isSubmitting on invalid submit", async () => {
    const form = createForm(schema, { initialValues: invalidValues });
    await form.submit(() => {});
    expect(form.getState().isSubmitting).toBe(false);
  });

  it("passes the parsed (transformed) output to onValid", async () => {
    const transformSchema = z.object({
      name: z.string().transform((s) => s.trim()),
    });
    const form = createForm(transformSchema, {
      initialValues: { name: "  Tim  " },
    });
    const onValid = vi.fn();
    await form.submit(onValid);
    expect(onValid).toHaveBeenCalledWith({ name: "Tim" });
  });
});

describe("form.setSubmitting", () => {
  it("manually flips isSubmitting", () => {
    const form = createForm(schema, { initialValues: validValues });
    form.setSubmitting(true);
    expect(form.getState().isSubmitting).toBe(true);
    form.setSubmitting(false);
    expect(form.getState().isSubmitting).toBe(false);
  });
});
