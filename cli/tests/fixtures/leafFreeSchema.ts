import { z } from "zod";

// Degenerate but valid input: no scalar leaves anywhere — every emitted
// helper/type/import must be usage-gated for this to compile.
export const leafFreeSchema = z.object({
  groups: z.array(z.object({})),
});
