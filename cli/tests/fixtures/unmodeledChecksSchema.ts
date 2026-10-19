import { z } from "zod";

// Checks the walker does not model. Each field's generated control and
// schema entry are still right (the IR carries the kind and the bounds it
// knows), but the generated spec's "filled with valid values" round trip
// parses the SAMPLE with the real schema, and a sample built without
// knowing the check fails it: "filled" is not five digits, 1 is not a
// multiple of 5, and so on. The spec must skip that case over these paths
// instead of shipping red.
export const unmodeledChecksSchema = z.object({
  zip: z.string().regex(/^\d{5}$/),
  code: z.string().startsWith("X-"),
  ip: z.ipv4(),
  step: z.number().multipleOf(5),
  handle: z.string().refine((value) => value !== "filled"),
  when: z.date().min(new Date("2030-01-01T00:00:00.000Z")),
  // Modeled checks stay live: a bounded string and a number bound.
  name: z.string().min(2),
  age: z.number().min(18),
  // The method-form formats are modeled like the top-level spellings.
  contact: z.string().email(),
});
