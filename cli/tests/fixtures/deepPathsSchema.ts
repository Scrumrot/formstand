import { z } from "zod";

// FieldPath depth-budget probe: ten-segment leaves (l1...l9.leaf, past
// formstand's 9-segment FieldPath budget) next to an at-the-limit branch
// (a.b.c.d.e.f.g.h.i — exactly 9 segments) and a shallow control, so one
// schema exercises degrade-to-TODO and still-binds side by side.
//
// NOTE: the object chain is deeper than fromZod's default nesting budget
// (--max-depth 10), so consumers must pass an explicit maxDepth (the tests
// use 12) — the PATH budget has to be the only thing degrading here.
export const deepPathsSchema = z.object({
  l1: z.object({
    l2: z.object({
      l3: z.object({
        l4: z.object({
          l5: z.object({
            l6: z.object({
              l7: z.object({
                l8: z.object({
                  l9: z.object({
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
  }),
  a: z.object({
    b: z.object({
      c: z.object({
        d: z.object({
          e: z.object({
            f: z.object({
              g: z.object({
                h: z.object({
                  i: z.string(),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
  title: z.string(),
});
