import { z } from "zod";

// Enum options and union tags carrying a double quote or a backslash: the
// component already quotes them through JSON.stringify, but the generated
// spec's valid-values literal interpolated them raw, so the spec file did
// not parse. The runtime values are legal zod literals, so the spec must
// quote them the same way the component does.
export const quotedOptionsSchema = z.object({
  greeting: z.enum(['say "hi"', "back\\slash"]),
  shape: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal('a "quoted" tag'), width: z.number() }),
    z.object({ kind: z.literal("plain"), height: z.number() }),
  ]),
});
