import { z } from "zod";

// One schema, two parses: the browser validates with it before the action
// is called (useFormActionState), and the server action parses the payload
// with it again. The second parse is the real guard; the first is the
// hydrated experience (field errors, touched marks, pending state).
export const signupSchema = z.object({
  name: z.string().min(2, "at least 2 characters"),
  email: z.email("a valid email address"),
  plan: z.enum(["starter", "pro", "enterprise"]),
  terms: z.boolean().refine((accepted) => accepted, "you must accept the terms"),
});

export type Signup = z.input<typeof signupSchema>;
export type SignupData = z.output<typeof signupSchema>;

export const initialSignup: Signup = {
  name: "",
  email: "",
  plan: "starter",
  terms: false,
};

// The action's state: what the last submission came back with. Serializable
// on purpose (it crosses the server boundary both ways).
export type SaveState = Readonly<{
  status: "idle" | "saved" | "rejected";
  message: string;
  saves: number;
}>;

export const initialSaveState: SaveState = {
  status: "idle",
  message: "nothing saved yet",
  saves: 0,
};
