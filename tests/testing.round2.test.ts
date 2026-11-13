import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { fillAndBlurField, submitForm } from "../src/testing";

// Regression pin for the second November 2026 review: fillAndBlurField
// returned undefined whenever the blur gate was closed, although the fill
// had already started the pass a test wants to await.

const schema = z.object({
  email: z.string().email("not an email"),
});

describe("fillAndBlurField's result", () => {
  it("falls back to the fill's result under mode onChange", () => {
    const form = createForm(schema, {
      initialValues: { email: "" },
      mode: "onChange",
    });
    const result = fillAndBlurField(form, "email", "nope");
    expect(result).toEqual({ kind: "invalid", errors: ["not an email"] });
  });

  it("falls back to the fill's result after a submit", async () => {
    const form = createForm(schema, { initialValues: { email: "" } });
    await submitForm(form);
    const result = fillAndBlurField(form, "email", "tim@example.com");
    expect(result).toEqual({ kind: "valid" });
  });

  it("still reports the blur's result when the blur gate validated", () => {
    const form = createForm(schema, { initialValues: { email: "" } });
    const result = fillAndBlurField(form, "email", "nope");
    expect(result).toEqual({ kind: "invalid", errors: ["not an email"] });
  });

  it("stays undefined under mode onSubmit", () => {
    const form = createForm(schema, {
      initialValues: { email: "" },
      mode: "onSubmit",
    });
    expect(fillAndBlurField(form, "email", "nope")).toBeUndefined();
  });
});
