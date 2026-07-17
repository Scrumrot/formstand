import { z } from "zod";

// FieldPath depth-budget probe: nine-segment leaves (l1...l8.leaf, past
// formstand's 7-segment FieldPath budget) next to an at-the-limit branch
// (a.b.c.d.e.f.g — exactly 7 segments) and a shallow control, so one schema
// exercises degrade-to-TODO and still-binds side by side.
export const deepPathsSchema = z.object({
  l1: z.object({
    l2: z.object({
      l3: z.object({
        l4: z.object({
          l5: z.object({
            l6: z.object({
              l7: z.object({
                l8: z.object({
                  leaf: z.string(),
                  count: z.number().nullable(),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
  a: z.object({
    b: z.object({
      c: z.object({
        d: z.object({
          e: z.object({
            f: z.object({
              g: z.string(),
            }),
          }),
        }),
      }),
    }),
  }),
  title: z.string(),
});
