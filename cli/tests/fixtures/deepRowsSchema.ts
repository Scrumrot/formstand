import { z } from "zod";

// FieldPath depth-budget probe for nested-array row extraction: each array
// level spends TWO segments (name + row index), so walk-depth alone says
// nothing about the bound path. Counts of the full template paths:
//
//   a.${p0}.b.${p1}.c.${index}.name          7  → binds (at the limit)
//   a.${p0}.b.${p1}.c.${p2}.d                7  → list hook binds...
//   a.${p0}.b.${p1}.c.${p2}.d.${index}       8  → ...but scalar rows degrade
//   a.${p0}.b.${p1}.c.${p2}.e.${index}.f     9  → row field degrades
//   a.${p0}.b.${p1}.c.${p2}.e.${index}.g     9  → no Rows pair extracted
export const deepRowsSchema = z.object({
  a: z.array(
    z.object({
      b: z.array(
        z.object({
          c: z.array(
            z.object({
              name: z.string(),
              d: z.array(z.string()),
              e: z.array(
                z.object({
                  f: z.string(),
                  g: z.array(z.string()),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  ),
});
