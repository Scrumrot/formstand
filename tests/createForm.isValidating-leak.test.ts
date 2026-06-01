import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const asyncSchema = z.object({
  username: z.string().min(2).refine(
    async (v) => {
      await new Promise((r) => setTimeout(r, 15));
      return v !== "taken";
    },
    { message: "taken" },
  ),
});

describe("isValidating cleared on values-change branch (B39)", () => {
  it("validateFieldAsync clears isValidating when values change but seq still owns", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken" },
    });
    const promise = form.validateFieldAsync("username");
    expect(form.getState().isValidating["username"]).toBe(true);
    form.setValue("username", "ok");
    await promise;
    expect(form.getState().isValidating["username"]).toBeUndefined();
  });

  it("validateAsync (form-level) clears isValidating when values change but seq still owns", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken" },
    });
    const promise = form.validateAsync();
    expect(form.getState().isValidating["__form__"]).toBe(true);
    form.setValue("username", "ok");
    await promise;
    expect(form.getState().isValidating["__form__"]).toBeUndefined();
  });

  it("validateFieldAsync does not clear isValidating when a newer call has superseded", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken" },
    });
    const first = form.validateFieldAsync("username");
    const second = form.validateFieldAsync("username");
    await first;
    expect(form.getState().isValidating["username"]).toBe(true);
    await second;
    expect(form.getState().isValidating["username"]).toBeUndefined();
  });
});

describe("submit in-flight counter (B41/B42)", () => {
  const schema = z.object({ name: z.string() });

  it("isSubmitting stays true across a forced overlap", async () => {
    const form = createForm(schema, { initialValues: { name: "Tim" } });
    const slow = () => new Promise<void>((r) => setTimeout(r, 25));
    const first = form.submit(slow);
    expect(form.getState().isSubmitting).toBe(true);
    const second = form.submit(slow, undefined, { force: true });
    await first;
    expect(form.getState().isSubmitting).toBe(true);
    await second;
    expect(form.getState().isSubmitting).toBe(false);
  });
});
