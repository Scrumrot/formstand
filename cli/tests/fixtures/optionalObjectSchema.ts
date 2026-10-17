import { z } from "zod";

// An optional and a nullable object section beside a required one. A blank
// form must be able to submit with the optional sections untouched: seeding
// them as populated objects (the pre-fix behavior) made zod reject their
// required members on every blank submit.
export const optionalObjectSchema = z.object({
  name: z.string(),
  billing: z
    .object({
      street: z.string(),
      zip: z.string().min(3),
      amount: z.number(),
    })
    .optional(),
  shipping: z.object({ city: z.string(), weight: z.number() }).nullable(),
  contact: z.object({ email: z.email() }),
});
