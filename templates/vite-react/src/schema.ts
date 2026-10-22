import { z } from "zod";

// The schema is the source of truth: it gives the form its value types, its
// validation, and its typed field paths. Edit it and the form follows; run
// `npm run generate` to let formstand-cli rewrite SignupForm.tsx from it.
export const signupSchema = z.object({
  name: z.string().min(2, "at least 2 characters"),
  email: z.email("a valid email address"),
  seats: z.int().min(1, "at least one seat").max(20, "20 at most"),
  plan: z.enum(["starter", "pro", "enterprise"]),
  terms: z.boolean().refine((accepted) => accepted, "you must accept the terms"),
});

export type Signup = z.input<typeof signupSchema>;

export const initialSignup: Signup = {
  name: "",
  email: "",
  seats: 1,
  plan: "starter",
  terms: false,
};
