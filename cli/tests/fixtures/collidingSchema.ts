import { z } from "zod";

// "userNames" and "user_names" normalize to the same Pascal identifier — the
// emitter must suffix the second set of generated identifiers (hook, item
// type, empty-item const) instead of redeclaring them.
export const collidingSchema = z.object({
  userNames: z.array(z.object({ value: z.string() })),
  user_names: z.array(z.object({ value: z.string() })),
});
