import { z } from "zod";

// Tuples: fixed-arity positional lists. The emitter binds each element at a
// static numeric-index path (coord.0, coord.1); this fixture proves those
// paths typecheck against the real library across all three backends, and
// covers a top-level tuple, a mixed-type tuple, and a tuple nested in an
// object section. Mirrored by the Shape type in ./tupleType.ts.
export const tupleSchema = z.object({
  coord: z.tuple([z.number(), z.number()]),
  pair: z.tuple([z.string(), z.number()]),
  range: z.object({
    span: z.tuple([z.number(), z.number()]),
  }),
  label: z.string(),
});
