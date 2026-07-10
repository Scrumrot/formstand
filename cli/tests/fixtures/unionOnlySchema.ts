import { z } from "zod";

// Regression (bug C3): the ONLY leaf kinds in the schema live inside a union
// variant, and the union has a single variant (so every field is a common
// key). The union renders its controls from hoisted hooks via the raw prop
// builders, so the leaf COMPONENTS (TextField/SelectField/…) must NOT be
// imported, and useVariantField (no variant-only field) must not be either.
export const unionOnlySchema = z.object({
  payment: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("card"), cardNumber: z.string() }),
  ]),
});
