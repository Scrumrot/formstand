import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

describe("invalid_union flattening", () => {
  it("surfaces per-branch issues at field-level paths", () => {
    const schema = z.object({
      pet: z.union([
        z.object({ kind: z.literal("cat"), lives: z.number() }),
        z.object({ kind: z.literal("dog"), breed: z.string() }),
      ]),
    });
    const form = createForm(schema, {
      initialValues: { pet: { kind: "cat", lives: "nine" } } as never,
    });
    const result = form.validate();
    expect(result.kind).toBe("invalid");
    const errors = form.getState().errors;
    // Branch 1 (cat): lives should be a number.
    expect(errors["pet.lives"]).toBeDefined();
    // Branch 2 (dog): kind mismatch.
    expect(errors["pet.kind"]).toBeDefined();
    // The generic "Invalid input" union message is replaced by branch issues.
    expect(errors["pet"]).toBeUndefined();
  });

  it("dedupes identical messages produced by multiple branches", () => {
    const schema = z.object({ v: z.union([z.number(), z.number()]) });
    const form = createForm(schema, {
      initialValues: { v: "not a number" } as never,
    });
    form.validate();
    const errors = form.getState().errors["v"];
    expect(errors).toBeDefined();
    expect(errors).toHaveLength(1);
  });

  it("keeps the union's own message when branches carry no issues", () => {
    // A discriminated union with an unknown discriminator produces an
    // invalid_union issue without usable branch errors.
    const schema = z.object({
      pet: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("cat"), lives: z.number() }),
        z.object({ kind: z.literal("dog"), breed: z.string() }),
      ]),
    });
    const form = createForm(schema, {
      initialValues: { pet: { kind: "fish" } } as never,
    });
    const result = form.validate();
    expect(result.kind).toBe("invalid");
    const errors = form.getState().errors;
    const keys = Object.keys(errors);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith("pet"))).toBe(true);
  });
});
