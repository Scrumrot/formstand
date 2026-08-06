import { z } from "zod";

// Regression (2026-08 container review): a root whose ONLY fields are
// tuples — no object, no array, and no root scalar leaf, anywhere. Every
// section-shaped gate (the single-file kit import gate, the module
// hooks-file useField export) must count tuples themselves; each shipped
// green while this shape emitted section chrome or hook imports with
// nothing backing them, because every other fixture carries an object,
// array, or root scalar that satisfied the gate by accident. The mixed
// element kinds keep the usage collectors exercised (tuple scalars are the
// only source of string/number usage here).
export const tupleOnlySchema = z.object({
  coord: z.tuple([z.number(), z.number()]),
  pair: z.tuple([z.string(), z.number()]),
});
