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

describe("restore() strips transient validation flags from the snapshot", () => {
  it("does not resurrect isValidating/isValidatingForm captured mid-flight", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "ok" },
    });
    const fieldPass = form.validateFieldAsync("username");
    const formPass = form.validateAsync();
    expect(form.getState().isValidating["username"]).toBe(true);
    expect(form.getState().isValidatingForm).toBe(true);

    // Snapshot taken while both passes are in flight captures the flags.
    const snap = form.snapshot();
    await Promise.all([fieldPass, formPass]);
    expect(form.getState().isValidating).toEqual({});
    expect(form.getState().isValidatingForm).toBe(false);

    // In-flight state is owned by live passes, never by snapshots: the
    // passes that set these flags have already settled, so restoring them
    // would stick them on forever (no pass left to clear them).
    form.restore(snap);
    expect(form.getState().isValidating).toEqual({});
    expect(form.getState().isValidatingForm).toBe(false);
  });
});
