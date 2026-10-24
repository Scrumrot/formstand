import { z } from "zod";

// Containers inside array rows (the 2026-09 row-containers work): a tuple
// as the row item (top-level and under a nested array), an array-of-arrays
// item, a union and a tuple as row-object FIELDS (the union optional, so
// the clearable-select wrapper compiles too), and a union item under a
// nested array, plus arrays INSIDE union variants (under a row union, a
// union row item and a static union; formstand 0.25). The generated
// bindings ride holed template paths (`invoices.${p0}.pay`,
// `teams.${p0}.methods.${index}`) and variant-array hooks that must
// typecheck against the real library's FieldPath/UnionValueAt machinery in
// both layouts and every backend.
export const rowContainersSchema = z.object({
  points: z.array(z.tuple([z.number(), z.number()])),
  grid: z.array(z.array(z.number())),
  invoices: z.array(
    z.object({
      ref: z.string(),
      pay: z
        .discriminatedUnion("kind", [
          z.object({
            kind: z.literal("card"),
            cardNumber: z.string(),
            // A container INSIDE a variant: its scalar leaves bind as
            // dotted variant sub-paths ("billing.zip", formstand 0.20).
            billing: z.object({ zip: z.string(), plus4: z.number() }),
            // An ARRAY inside a variant under a row union: a Rows pair on
            // useVariantFieldArray(`invoices.${p0}.pay`, `receipts`).
            receipts: z.array(z.object({ url: z.string(), amount: z.number() })),
            // The same, one level inside a variant-only object, and a
            // nested list under the variant array's rows.
            audit: z.object({
              notes: z.array(z.object({ text: z.string(), tags: z.array(z.string()) })),
            }),
          }),
          z.object({ kind: z.literal("paypal"), email: z.string() }),
        ])
        .optional(),
    }),
  ),
  // A static union whose variant holds an array of objects.
  shipping: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("pickup"), store: z.string() }),
    z.object({
      mode: z.literal("courier"),
      stops: z.array(z.object({ address: z.string(), eta: z.number().optional() })),
    }),
  ]),
  segments: z.array(
    z.object({ name: z.string(), span: z.tuple([z.number(), z.number()]) }),
  ),
  teams: z.array(
    z.object({
      title: z.string(),
      methods: z.array(
        z.discriminatedUnion("mode", [
          // A variant array of scalars under a union ROW ITEM (the row's
          // index renames to p1 for the extracted Rows component).
          z.object({ mode: z.literal("a"), x: z.string(), extras: z.array(z.string()) }),
          z.object({ mode: z.literal("b"), y: z.number() }),
        ]),
      ),
      marks: z.array(z.tuple([z.string(), z.number()])),
    }),
  ),
});
