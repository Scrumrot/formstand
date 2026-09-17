import { z } from "zod";

// Containers inside array rows (the 2026-09 row-containers work): a tuple
// as the row item (top-level and under a nested array), an array-of-arrays
// item, a union and a tuple as row-object FIELDS (the union optional, so
// the clearable-select wrapper compiles too), and a union item under a
// nested array. The generated bindings ride holed template paths
// (`invoices.${p0}.pay`, `teams.${p0}.methods.${index}`) that must
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
          z.object({ kind: z.literal("card"), cardNumber: z.string() }),
          z.object({ kind: z.literal("paypal"), email: z.string() }),
        ])
        .optional(),
    }),
  ),
  segments: z.array(
    z.object({ name: z.string(), span: z.tuple([z.number(), z.number()]) }),
  ),
  teams: z.array(
    z.object({
      title: z.string(),
      methods: z.array(
        z.discriminatedUnion("mode", [
          z.object({ mode: z.literal("a"), x: z.string() }),
          z.object({ mode: z.literal("b"), y: z.number() }),
        ]),
      ),
      marks: z.array(z.tuple([z.string(), z.number()])),
    }),
  ),
});
