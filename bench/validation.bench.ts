import { bench, describe } from "vitest";
import { z } from "zod";
import { fieldSchemaAtPath, validateSync } from "../src/core/validation";

// Answers the design question: does per-field subschema extraction earn its
// complexity, or is a full-form parse cheap enough to be the only mode?
// Run with: npx vitest bench --run

const wideShape = Object.fromEntries(
  Array.from({ length: 50 }, (_, i) => [`field${i}`, z.string().min(1)]),
);

const formSchema = z.object({
  ...wideShape,
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    zip: z.string().min(5),
  }),
  items: z.array(
    z.object({ name: z.string().min(1), qty: z.number().int().min(1) }),
  ),
});

// The same form with a root-level refine — the shape that forces field
// validation onto the full-parse fallback path.
const refinedSchema = formSchema.refine(
  (v) => v.field0 !== v.field1,
  "must differ",
);

const validValues = {
  ...Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`field${i}`, `value ${i}`]),
  ),
  address: { street: "Main", city: "Springfield", zip: "10001" },
  items: Array.from({ length: 20 }, (_, i) => ({ name: `row ${i}`, qty: 1 })),
};

const invalidValues = { ...validValues, field7: "" };

const leafSchema = fieldSchemaAtPath(formSchema, "field7");
const rowSchema = fieldSchemaAtPath(formSchema, "items.3.name");

describe("full-form parse (50 fields + nested + 20 array rows)", () => {
  bench("valid values", () => {
    validateSync(formSchema, validValues);
  });

  bench("invalid values (one bad field)", () => {
    validateSync(formSchema, invalidValues);
  });

  bench("valid values through a root refine", () => {
    validateSync(refinedSchema, validValues);
  });
});

describe("per-field subschema parse (the fast path)", () => {
  bench("leaf string parse", () => {
    if (leafSchema !== null) validateSync(leafSchema, "value 7");
  });

  bench("array-row leaf parse", () => {
    if (rowSchema !== null) validateSync(rowSchema, "row 3");
  });

  bench("subschema extraction walk (uncached)", () => {
    fieldSchemaAtPath(formSchema, "items.3.name");
  });
});
