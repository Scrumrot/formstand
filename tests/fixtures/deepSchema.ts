import { z } from "zod";

// The ONE ten-level pyramid the depth-budget type tests share
// (tests/fieldPath.depth.test.ts and tests/react/useField.pathDepth.test.tsx
// each carried their own copy): "a...i" is a 9-segment path (exactly at the
// default limit), "a...i.j" is 10 (past it), and "a...i.tags" a 10-segment
// array path for the useFieldArray side.
export const deepSchema = z.object({
  a: z.object({
    b: z.object({
      c: z.object({
        d: z.object({
          e: z.object({
            f: z.object({
              g: z.object({
                h: z.object({
                  i: z.object({
                    j: z.string(),
                    k: z.number(),
                    tags: z.array(z.string()),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
});

export const deepInitialValues: z.input<typeof deepSchema> = {
  a: {
    b: {
      c: {
        d: { e: { f: { g: { h: { i: { j: "leaf", k: 1, tags: ["t"] } } } } } },
      },
    },
  },
};

export const NINE = "a.b.c.d.e.f.g.h.i" as const;
export const TEN = "a.b.c.d.e.f.g.h.i.j" as const;
export const TEN_ARRAY = "a.b.c.d.e.f.g.h.i.tags" as const;
