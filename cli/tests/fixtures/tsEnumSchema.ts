import { z } from "zod";

// A TS enum behind z.enum / z.nativeEnum: the entries' keys differ from
// their values (Red -> "red"), and z.input is the enum TYPE, not the string
// union. The library's SelectField checks each option literal against that
// type, so `{ value: "red" }` is a compile error there: the plain
// single-file emitter must bind these through the raw select builder.
export enum Color {
  Red = "red",
  Green = "green",
  Blue = "blue",
}

export const tsEnumSchema = z.object({
  name: z.string(),
  color: z.enum(Color),
  shade: z.nativeEnum(Color).optional(),
  // A plain string enum next to them keeps the typed SelectField path.
  size: z.enum(["s", "m", "l"]),
});
