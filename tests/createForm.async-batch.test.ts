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
  email: z.email(),
});

describe("form.validateFieldsAsync", () => {
  it("settles valid when all listed paths pass async validation", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "ok", email: "t@t.com" },
    });
    const result = await form.validateFieldsAsync(["username", "email"]);
    expect(result).toEqual({ kind: "valid" });
    expect(form.getState().errors).toEqual({});
  });

  it("settles invalid with the scoped errors for failing listed paths only", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", email: "bad" },
    });
    const result = await form.validateFieldsAsync(["username", "email"]);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors["username"]).toEqual(["taken"]);
    }
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
