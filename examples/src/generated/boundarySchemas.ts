import { z } from "zod";

// Hand-written INPUTS for the generated boundary demos — each schema is
// chosen to push a different edge of the CLI's supported surface and of the
// library's runtime (deep nesting near the depth budget, every scalar kind
// with optional/nullable/default/pipe wrappers, tuples, three-level nested
// arrays, and duplicate-prone primitive rows). The forms next to this file
// are formstand-cli output, untouched: regenerate them (see the commands in
// tests/react/generated-boundary.test.tsx) instead of editing.

// Every supported field kind and wrapper in one schema, plus a tuple and a
// two-level object nest — the "does everything still generate and run"
// probe.
export const kitchenSinkSchema = z.object({
  title: z.string().min(2).max(40),
  contact: z.object({
    email: z.email(),
    phone: z.string().optional(),
    address: z.object({
      street: z.string().min(1),
      city: z.string().default("Springfield"),
      zip: z.string().regex(/^\d{5}$/, "five digits"),
    }),
  }),
  age: z.int().min(0).max(130),
  rating: z.number().nullable(),
  newsletter: z.boolean().default(false),
  birthday: z.date().nullable(),
  plan: z.enum(["free", "pro", "enterprise"]),
  channel: z
    .union([z.literal("email"), z.literal("sms"), z.literal("push")])
    .optional(),
  coordinates: z.tuple([z.number(), z.number()]),
  aliases: z.array(z.string().min(1)).max(5),
  projects: z
    .array(
      z.object({
        name: z.string().min(1),
        tags: z.array(z.string()),
        active: z.boolean(),
      }),
    )
    .min(1),
});

// Nine levels of object nesting straddling formstand's typed-path budget
// (FieldPath stops at 9 SEGMENTS by default): the l1...l8 leaves are
// 9-segment paths — exactly AT the limit, so they bind real controls —
// while the extra l9 level puts its leaf at 10 segments, which the CLI
// degrades to a `// TODO`. Both sides of the boundary in one form, plus a
// branch exercising every wrapper the walkers unwrap. (The chain outgrows
// the walkers' default nesting budget, so generation passes
// `--max-depth 11` — see scripts/generate-cli-demos.mjs.)
export const deepBoundarySchema = z.object({
  l1: z.object({
    l2: z.object({
      l3: z.object({
        l4: z.object({
          l5: z.object({
            l6: z.object({
              l7: z.object({
                l8: z.object({
                  leaf: z.string().min(1),
                  count: z.int().nullable(),
                  l9: z.object({
                    tooDeep: z.string(),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
  mixed: z.object({
    optionalDate: z.date().optional(),
    nullableEnum: z.enum(["a", "b"]).nullable(),
    defaultedNumber: z.number().default(42),
    piped: z.string().pipe(z.string().min(3)),
  }),
});

// Three-level nested arrays (teams → members → phones — the CLI's
// recursive row extraction) plus a duplicate-prone primitive array, the
// exact shape the row-id machinery is fuzzed against.
export const nestedArrayStressSchema = z.object({
  teams: z.array(
    z.object({
      name: z.string().min(1),
      members: z.array(
        z.object({
          alias: z.string(),
          phones: z.array(z.string()),
        }),
      ),
    }),
  ),
  duplicateTags: z.array(z.string()),
});
