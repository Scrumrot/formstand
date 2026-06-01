import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({ name: z.string() });

describe("submit isSubmitting baseline (B46)", () => {
  it("restores isSubmitting=true if external setSubmitting(true) was set before submit", async () => {
    const form = createForm(schema, { initialValues: { name: "Tim" } });
    form.setSubmitting(true);
    expect(form.getState().isSubmitting).toBe(true);
    await form.submit(() => {});
    expect(form.getState().isSubmitting).toBe(true);
  });

  it("restores isSubmitting=false if it was false before submit", async () => {
    const form = createForm(schema, { initialValues: { name: "Tim" } });
    expect(form.getState().isSubmitting).toBe(false);
    await form.submit(() => {});
    expect(form.getState().isSubmitting).toBe(false);
  });

  it("preserves baseline across forced overlapping submits", async () => {
    const form = createForm(schema, { initialValues: { name: "Tim" } });
    form.setSubmitting(true);
    const slow = () => new Promise<void>((r) => setTimeout(r, 20));
    const first = form.submit(slow);
    const second = form.submit(slow, undefined, { force: true });
    await Promise.all([first, second]);
    expect(form.getState().isSubmitting).toBe(true);
  });
});
