import { z } from "zod";

// Regression (bug C2): an array whose ITEM is a discriminated union. In the
// module layout the array-row leaf path is dynamic, so the union item cannot
// be bound (useVariantField needs a static union path); the section must emit
// a TODO comment and NOT call textInputProps on the union-typed row field.
export const arrayUnionSchema = z.object({
  methods: z.array(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("card"), cardNumber: z.string() }),
      z.object({ kind: z.literal("paypal"), email: z.string() }),
    ]),
  ),
});
