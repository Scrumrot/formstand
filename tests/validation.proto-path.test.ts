import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { flattenIssues } from "../src/core/validation";

// Regression (2026-07 review #4): reading `acc["__proto__"]` off a plain
// object walks the prototype chain and returns Object.prototype instead of
// undefined, so the first issue keyed at "__proto__" crashed flattenIssues
// with `existing.includes is not a function`. Zod itself skips own
// __proto__ keys when parsing records, so the path is only reachable
// through user-emitted issues (ctx.addIssue in a superRefine).
describe("flattenIssues with a __proto__ issue path", () => {
  const protoSchema = z
    .object({})
    .superRefine((_, ctx) => {
      ctx.addIssue({ code: "custom", message: "bad key", path: ["__proto__"] });
    });

  it("keys the error as an own property instead of crashing", () => {
    const result = protoSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) throw new Error();
    const errors = flattenIssues(result.error.issues);
    expect(Object.hasOwn(errors, "__proto__")).toBe(true);
    expect(errors["__proto__"]).toEqual(["bad key"]);
    // The accumulator's prototype was never reassigned.
    expect(Object.getPrototypeOf(errors)).toBe(Object.prototype);
  });

  it("still dedupes repeated messages on the hostile key", () => {
    const twice = z.object({}).superRefine((_, ctx) => {
      ctx.addIssue({ code: "custom", message: "bad key", path: ["__proto__"] });
      ctx.addIssue({ code: "custom", message: "bad key", path: ["__proto__"] });
    });
    const result = twice.safeParse({});
    if (result.success) throw new Error();
    expect(flattenIssues(result.error.issues)["__proto__"]).toEqual([
      "bad key",
    ]);
  });
});

// Same hardening class in the channel merge: `schema[k] === undefined` for
// k === "__proto__" reads Object.prototype (never undefined), which silently
// dropped the server entry from the merged errors map.
describe("server errors keyed at __proto__", () => {
  it("survive the channel merge into state.errors", () => {
    const form = createForm(z.object({ name: z.string() }), {
      initialValues: { name: "x" },
    });
    form.setError("__proto__" as never, ["bad key"]);
    expect(Object.hasOwn(form.getState().errors, "__proto__")).toBe(true);
    expect(form.getState().errors["__proto__"]).toEqual(["bad key"]);
  });
});
