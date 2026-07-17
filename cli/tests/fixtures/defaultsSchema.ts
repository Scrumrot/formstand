import { z } from "zod";

// `.default()` coverage for generated initialValues: every kind that seeds
// a literal (string / finite number / boolean / enum option, value or
// factory form), plus the shapes that deliberately keep the blank behavior
// (dates, arrays) and a quote-hostile string default (escaping).
export const defaultsSchema = z.object({
  theme: z.string().default("light"),
  retries: z.number().default(3),
  newsletter: z.boolean().default(true),
  plan: z.enum(["free", "pro"]).default("pro"),
  factory: z.number().default(() => 42),
  quoted: z.string().default('say "hi"'),
  createdAt: z.date().default(() => new Date(0)),
  tags: z.array(z.string()).default([]),
});
