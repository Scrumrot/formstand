import { z } from "zod";

// The `.describe()` / `.meta()` capture fixture: helper text on every scalar
// kind, through wrappers in both orders, from `.meta({ description })`, on a
// nested-object field, an array-row field, a tuple element, and a union
// variant field — the positions the emitters route to different slots
// (Bound* props, inline variant literals, module field files).
export const describedSchema = z.object({
  grossWeight: z.number().positive().describe("1,000 lbs"),
  callsign: z.string().describe("ATC callsign"),
  isCargo: z.boolean().describe("checked for freight ops"),
  category: z.enum(["piston", "turboprop", "jet"]).describe("aircraft class"),
  // Wrapper orders: description on the inner type vs. on the outer wrapper.
  firstFlight: z.date().describe("maiden flight date").optional(),
  registration: z.string().optional().describe("tail number"),
  // The registry-based spelling — same store as .describe().
  fuelCapacity: z.number().meta({ description: "gallons usable" }),
  limits: z.object({
    ceiling: z.number().describe("feet MSL"),
  }),
  legs: z.array(
    z.object({
      distance: z.number().describe("nautical miles"),
    }),
  ),
  coord: z.tuple([
    z.number().describe("latitude"),
    z.number().describe("longitude"),
  ]),
  payment: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("card"),
      last4: z.string().describe("last four digits"),
    }),
    z.object({ kind: z.literal("invoice"), account: z.string() }),
  ]),
});
