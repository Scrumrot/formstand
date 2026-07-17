import { z } from "zod";

// FieldPath depth-budget probe for nested-array row extraction: each array
// level spends TWO segments (name + row index), so walk-depth alone says
// nothing about the bound path. Counts of the full template paths:
//
//   a.${p0}.b.${p1}.c.${p2}.h.${index}.name        9  → binds (at the limit)
//   a.${p0}.b.${p1}.c.${p2}.h.${p3}.d              9  → list hook binds...
//   a.${p0}.b.${p1}.c.${p2}.h.${p3}.d.${index}    10  → ...but scalar rows degrade
//   a.${p0}.b.${p1}.c.${p2}.h.${p3}.e.${index}.f  11  → row field degrades
//   a.${p0}.b.${p1}.c.${p2}.h.${p3}.e.${index}.g  11  → no Rows pair extracted
//
// NOTE: unlike deepPathsSchema, this nests past even the derived default
// walker budget (FORMSTAND_PATH_DEPTH + 2 = 11) — consumers pass an
// explicit maxDepth (the tests use 12).
export const deepRowsSchema = z.object({
  a: z.array(
    z.object({
      b: z.array(
        z.object({
          c: z.array(
            z.object({
              h: z.array(
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
    }),
  ),
});
