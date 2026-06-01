import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const asyncSchema = z.object({
  username: z.string().min(2).refine(
    async (v) => {
      await new Promise((r) => setTimeout(r, 5));
      return v !== "taken";
    },
    { message: "taken" },
  ),
  email: z.string().email(),
});

describe("form.validateFieldsAsync", () => {
  it("returns true when all listed paths pass async validation", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "ok", email: "t@t.com" },
    });
    const ok = await form.validateFieldsAsync(["username", "email"]);
    expect(ok).toBe(true);
    expect(form.getState().errors).toEqual({});
  });

  it("returns false and writes errors for failing listed paths only", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", email: "bad" },
    });
    const ok = await form.validateFieldsAsync(["username", "email"]);
    expect(ok).toBe(false);
    expect(form.getState().errors["username"]).toEqual(["taken"]);
    expect(form.getState().errors["email"]).toBeDefined();
  });

  it("preserves errors at non-listed paths", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", email: "bad" },
    });
    await form.validateAsync();
    expect(form.getState().errors["email"]).toBeDefined();

    form.setValue("username", "ok");
    await form.validateFieldsAsync(["username"]);
    expect(form.getState().errors["username"]).toBeUndefined();
    expect(form.getState().errors["email"]).toBeDefined();
  });
});
