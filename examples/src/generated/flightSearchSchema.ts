import { z } from "zod";

// Hand-written INPUT for the generated --live --form-prop demo (like
// boundarySchemas.ts, this file is a pipeline input, not CLI output): a
// compact flight-search form — the kind of thing a map sits next to, where
// nothing ever submits and every keystroke should reach the map. The form
// next to this file is formstand-cli output, untouched: regenerate it via
// scripts/generate-cli-demos.mjs instead of editing.
export const flightSearchSchema = z.object({
  origin: z
    .string()
    .regex(/^[A-Z]{4}$/, "ICAO code — four capital letters"),
  destination: z
    .string()
    .regex(/^[A-Z]{4}$/, "ICAO code — four capital letters"),
  aircraft: z.enum(["C172", "SR22", "PC12", "TBM930"]),
  passengers: z.int().min(1, "at least the pilot").max(9),
  cruiseAltitude: z
    .int("whole feet")
    .min(1000, "min 1000 ft")
    .max(45000, "max FL450"),
  instrumentFlight: z.boolean(),
});
