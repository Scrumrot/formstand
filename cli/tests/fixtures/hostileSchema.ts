import { z } from "zod";

// Field names chosen to attack each emission context: JSX string attributes
// (quotes), template-literal row paths (backticks, ${}), JSX text (braces,
// angle brackets), and formstand's dot-separated paths ("a.b").
export const hostileSchema = z.object({
  'he said "hi"': z.string(),
  "back`tick": z.string(),
  "dollar${brace}": z.number(),
  "{braces}": z.boolean(),
  "<angles>": z.enum(["<a>", 'he "said"', "back`tick"]),
  "a.b": z.string(),
  "rows`${evil}": z.array(
    z.object({
      '"quoted"': z.string(),
      "tick`": z.number(),
      "deep.dot": z.string(),
    }),
  ),
});
