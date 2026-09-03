import { z } from "zod";

// A PascalCase schema export whose name IS the name the module layout
// derives for its schema type alias ("MySchema" -> MyForm -> My + Schema).
// The barrel used to export two different MySchemas from ./schema and
// ./types (TS2308); the alias now yields the name to the value.
export const MySchema = z.object({
  title: z.string(),
  count: z.number(),
});
