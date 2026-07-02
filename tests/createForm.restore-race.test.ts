import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const asyncSchema = z.object({
  username: z.string().refine(
    async (v) => {
      await new Promise((r) => setTimeout(r, 10));
      return v !== "taken";
    },
    { message: "taken" },
  ),
});

describe("restore() during in-flight async validation", () => {
  it("drops the stale field validation write after a restore", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "ok" },
    });
    const snap = form.snapshot();

    form.setValue("username", "taken");
    const pending = form.validateFieldAsync("username");
    form.restore(snap);

    await pending;
    // The result was computed for "taken" but the values were rolled back —
    // the values-reference guard must drop the write.
    expect(form.getState().values.username).toBe("ok");
    expect(form.getState().errors).toEqual({});
    expect(form.getState().isValidating).toEqual({});
  });

  it("drops the stale whole-form validation write after a restore", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "ok" },
    });
    const snap = form.snapshot();

    form.setValue("username", "taken");
    const pending = form.validateAsync();
    form.restore(snap);

    await pending;
    expect(form.getState().errors).toEqual({});
    expect(form.getState().isValidatingForm).toBe(false);
  });
});
