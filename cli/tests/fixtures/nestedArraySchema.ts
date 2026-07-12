import { z } from "zod";

// Nested arrays inside array rows: the single-file layout extracts a child
// {Stem}Rows component per nested array, recursively. This fixture exercises a
// scalar nested array (tags), an object nested array (phones), and three
// levels of nesting (teams > members > phones) — the generated child
// components (typed `form` prop, p0/p1 index threading) must typecheck against
// the real library across all three backends.
export const nestedArraySchema = z.object({
  contacts: z.array(
    z.object({
      email: z.string(),
      phones: z.array(z.object({ number: z.string(), primary: z.boolean() })),
      tags: z.array(z.string()),
    }),
  ),
  teams: z.array(
    z.object({
      name: z.string(),
      members: z.array(
        z.object({
          email: z.string(),
          phones: z.array(z.string()),
        }),
      ),
    }),
  ),
});
