import { z } from "zod";

// z.coerce.* parses ANY input, so z.input is `unknown` for every one of
// them: a number control bound to `coerced` fails typecheck (its path is
// not number-valued), and the generated spec's number sample proves
// nothing about what the form really holds. The walker degrades each to a
// TODO stand-in instead of trusting the base type.
export const coerceSchema = z.object({
  coerced: z.coerce.number(),
  d: z.coerce.date(),
  b: z.coerce.boolean(),
  plain: z.string(),
});
