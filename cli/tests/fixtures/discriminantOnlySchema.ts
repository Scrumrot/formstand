import { z } from "zod";

// A union whose first variant carries nothing beyond the discriminant: the
// "pickup" branch has no fields to render, so every emitter used to produce
// an empty `{kind.value === "pickup" && (<></>)}` block for it, in each kit
// and in the module layout. The same shape sits inside an array row so the
// row-union emitters are covered too.
export const discriminantOnlySchema = z.object({
  reference: z.string(),
  fulfilment: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("pickup") }),
    z.object({ kind: z.literal("delivery"), address: z.string() }),
  ]),
  legs: z.array(
    z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("walk") }),
      z.object({ mode: z.literal("drive"), km: z.number() }),
    ]),
  ),
});
