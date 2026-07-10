import { z } from "zod";

// A discriminated union at a field position: `payment` switches shape on its
// `method` discriminant. Exercises variant fields of several kinds (string,
// number, enum) plus a plain sibling field so the union sits alongside
// ordinary fields.
export const unionSchema = z.object({
  reference: z.string(),
  payment: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("card"),
      cardNumber: z.string(),
      installments: z.number(),
    }),
    z.object({
      method: z.literal("paypal"),
      email: z.string(),
    }),
    z.object({
      method: z.literal("invoice"),
      terms: z.enum(["net30", "net60"]),
    }),
  ]),
});
