import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fromZod } from "../src/fromZod";
import { collectTestPlan } from "../src/testCases";

// The generated spec's "a blank submit marks the first blank-invalid
// control" case queries getByLabelText(label), which throws when the label
// matches two controls. Uniqueness was judged among the blank-invalid set
// only, so a required "Age" beside an optional "Age" in another section
// was chosen and the spec threw in the render case.

describe("the generated spec's blank-submit label", () => {
  it("is unique among every rendered label, not only the blank-invalid ones", () => {
    const schema = z.object({
      age: z.number(),
      spouse: z.object({
        age: z.number().optional(),
        born: z.date(),
      }),
    });
    const plan = collectTestPlan(fromZod(schema));
    // "Age" labels two controls (the second is optional, so it never
    // qualified as blank-invalid and did not count before). "Born" is
    // unambiguous.
    expect(plan.firstInvalidLabel).toBe("Born");
    // A label shared with any other control is dropped from the fills too.
    expect(plan.labelFills.map((fill) => fill.label)).toEqual([]);
  });

  it("is absent when every blank-invalid label is shared", () => {
    const plan = collectTestPlan(
      fromZod(
        z.object({
          age: z.number(),
          spouse: z.object({ age: z.number().optional() }),
        }),
      ),
    );
    expect(plan.firstInvalidLabel).toBeUndefined();
  });

  it("counts a degraded placeholder and a union's visible leaves as rendered labels", () => {
    const plan = collectTestPlan(
      fromZod(
        z.object({
          name: z.string().min(1),
          meta: z.record(z.string(), z.string()).describe("x"),
          payment: z.discriminatedUnion("method", [
            z.object({ method: z.literal("card"), name: z.string() }),
            z.object({ method: z.literal("bank"), iban: z.string() }),
          ]),
        }),
      ),
    );
    // Root "Name" collides with the card variant's "Name", on screen for a
    // blank form, so no label qualifies.
    expect(plan.firstInvalidLabel).toBeUndefined();
  });
});
