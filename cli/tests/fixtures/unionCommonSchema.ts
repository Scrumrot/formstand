import { z } from "zod";

// Regression (bug C1): `amount` appears in EVERY variant, so it is a COMMON
// key. useVariantField excludes common keys (VariantKeys resolves them to
// `never`), so the emitter must bind `amount` with plain useField on the typed
// union path and render it outside the per-variant blocks; only the
// variant-only `cardNumber`/`email` go through useVariantField.
export const unionCommonSchema = z.object({
  payment: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("a"),
      amount: z.number(),
      cardNumber: z.string(),
    }),
    z.object({
      kind: z.literal("b"),
      amount: z.number(),
      email: z.string(),
    }),
  ]),
});
