import { z } from "zod";

// Mirrored by the Profile type in ./profileType.ts — keep the two in sync,
// the fromType test asserts their IRs match.
export const profileSchema = z.object({
  firstName: z.string(),
  age: z.number().optional(),
  bio: z.string().nullable(),
  isAdmin: z.boolean(),
  role: z.enum(["admin", "editor", "viewer"]),
  birthday: z.date().optional(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    zip: z.string().optional(),
  }),
  contacts: z.array(
    z.object({
      email: z.string(),
      phone: z.string().nullable(),
      kind: z.enum(["home", "work"]),
    }),
  ),
});
