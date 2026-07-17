import { z } from "zod";

// A non-deterministic factory (stand-in for Date.now / randomUUID, but
// counter-based so the test itself is deterministic): every read of zod
// v4's resolving def.defaultValue getter yields a fresh value. Capturing
// one would bake a run-dependent literal into byte-deterministic output —
// the walk reads twice and refuses when the reads disagree.
const counter = { value: 0 };

export const nonDeterministicDefaultSchema = z.object({
  seq: z.number().default(() => {
    counter.value += 1;
    return counter.value;
  }),
  name: z.string(),
});
