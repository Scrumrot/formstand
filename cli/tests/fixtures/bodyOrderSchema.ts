import { z } from "zod";

// Root fields and sections interleaved on purpose: the module layout's form
// body used to render every root field first and every section after, so
// this came out as name, email, agreed, address, tags. The author's reading
// order (a section between two fields) is part of the schema.
export const bodyOrderSchema = z.object({
  name: z.string(),
  address: z.object({ street: z.string() }),
  email: z.email(),
  tags: z.array(z.string()),
  agreed: z.boolean(),
});
