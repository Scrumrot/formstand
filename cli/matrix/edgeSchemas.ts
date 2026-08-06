import { z } from "zod";

// Edge-config fixtures for the version matrix: root shapes the kitchen-sink
// fixture cannot represent, because they are defined by what they LACK.
// Both exist because a reviewed bug class shipped while the matrix was
// green — its one fixture always had object and array fields, so the
// section-import gate and the union shell/import pairing were never
// exercised at their edges.

// A tuple-only root: no object field, no array field, anywhere. The
// single-file section-import gate must count the tuple itself, or the
// output renders section chrome (<Row>/<Col>, <Grid>, <Typography>,
// <Title>, <Heading>) that its import block never mentions.
// The mixed tuple matters as much as the tuple-only root: a homogeneous
// tuple hides FieldValue imprecision (a union of identical elements
// collapses), while [string, number, boolean] forces each positional
// binding to carry its exact element type through the kit's own controls.
export const tupleOnlySchema = z.object({
  coordinates: z.tuple([z.number(), z.number()]),
  record: z.tuple([z.string(), z.number(), z.boolean()]),
});

// A root whose only composite field is a discriminated union. The union
// section keeps its vertical shell at any column count (its children are
// conditional fragments, which cannot each be a grid cell), so its imports
// must be computed from the same forced 1-column visual as the shell —
// computing them from the original multi-column visual imported Grid while
// rendering Stack.
export const rootUnionSchema = z.object({
  reference: z.string(),
  payment: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("card"),
      last4: z.string(),
      holder: z.string(),
    }),
    z.object({
      method: z.literal("bank"),
      iban: z.string(),
      holder: z.string(),
    }),
  ]),
});
