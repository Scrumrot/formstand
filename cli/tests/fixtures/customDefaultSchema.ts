import { z } from "zod";

// A `.default()` on a shape the walker cannot represent: z.custom degrades
// to a string FALLBACK spec (todo set), whose real z.input type is NOT the
// plain string the fallback claims. Seeding the captured "#c0ffee" into
// initialValues would put a plain string literal in a HexColor slot — a
// type error in the generated file's checked annotation. The emitter must
// skip defaults on todo fallbacks; the field keeps its blank behavior.
export type HexColor = string & { readonly __hexBrand: "HexColor" };

export const customDefaultSchema = z.object({
  accent: z
    .custom<HexColor>(
      (value) => typeof value === "string" && value.startsWith("#"),
    )
    .default("#c0ffee" as HexColor),
  name: z.string(),
});
