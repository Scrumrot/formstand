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

// The clearable-union fixture: an optional and a nullable discriminated
// union side by side. Their seeds start empty (undefined/null) and the
// discriminant select writes the WHOLE union through the emitted wrapper,
// so each kit's select binding must accept the wrapper object (a spread of
// the field plus a widened setValue) against the real .d.ts — plus mui's
// explicit None item. The single-field "full" variant also exercises the
// fragment elision (one rendered element, no <>).
export const clearableUnionSchema = z.object({
  label: z.string(),
  insurance: z
    .discriminatedUnion("plan", [
      z.object({ plan: z.literal("basic"), cap: z.number() }),
      z.object({ plan: z.literal("full"), provider: z.string() }),
    ])
    .optional(),
  escalation: z
    .discriminatedUnion("channel", [
      z.object({ channel: z.literal("email"), address: z.string() }),
      z.object({ channel: z.literal("pager"), rotation: z.string() }),
    ])
    .nullable(),
});

// A union AS the array row item: the generated {Stem}Row binds the
// discriminant with the field hook and each variant-only field with the
// variant hook on the ROW-INDEXED path (formstand 0.16+), so every kit's
// row rendering — including the hoisted number-props hook inside the row
// component — must typecheck against the real .d.ts, in both layouts.
export const unionRowsSchema = z.object({
  reference: z.string(),
  methods: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("card"),
        cardNumber: z.string(),
        installments: z.number(),
      }),
      z.object({ kind: z.literal("paypal"), email: z.string() }),
    ]),
  ),
});
