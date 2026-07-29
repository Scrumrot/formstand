import { z } from "zod";

// The per-field component-override fixture (config `fields`): a root string
// (the twin project's ICAO case — options are DATA, not a zod enum), an enum
// to upgrade to a combobox, an array of objects with a string row field
// ("crew.*.role"), a scalar string array ("tags.*"), a nested array-of-
// arrays (options-prop threading through extracted Rows components), an
// object nested inside array rows (module-layout reachability errors), and
// colliding names ("crew_role" vs "crew.*.role" both derive crewRoleOptions).
export const overridesSchema = z.object({
  icao: z.string().describe("Four-letter airport code"),
  aircraft: z.enum(["C172", "SR22", "PC12"]),
  crew_role: z.string(),
  notes: z.string().optional(),
  crew: z.array(
    z.object({
      role: z.string(),
      years: z.number(),
      home: z.object({
        base: z.string(),
      }),
    }),
  ),
  tags: z.array(z.string()),
  legs: z.array(
    z.object({
      waypoints: z.array(
        z.object({
          fix: z.string(),
        }),
      ),
    }),
  ),
  meta: z.object({
    region: z.string(),
  }),
});
