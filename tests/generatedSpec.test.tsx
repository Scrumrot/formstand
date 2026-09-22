// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { fromZod } from "../cli/src/fromZod";
import { emitPlainForm } from "../cli/src/codegen";
import { collectTestPlan } from "../cli/src/testCases";
import { emitComponentSpec } from "../cli/src/testsEmit";

// THE proof for generated tests: the emitted spec doesn't just typecheck —
// it RUNS, here, against the library source (the vitest aliases map
// "formstand" and "formstand/testing" onto src/). The component and its
// spec are generated at collection time into tests/.generated (inside the
// project so vitest's transform pipeline picks the .tsx up), then the spec
// module is imported — its describe/it blocks register in THIS suite, so a
// generated assertion that stops holding fails CI like any hand-written
// test. The fixture deliberately covers every case shape: a formatted
// string (required + format + render cases), a required number and enum
// (blank-invalid), an optional string, a nested object, and (since the
// check-metadata enrichment) a length-bounded string, an integer with an
// exclusive lower bound, a maximum-only number, and an array with a row
// minimum (blank-invalid at the array path, valid values carry a row).

const schema = z.object({
  email: z.email(),
  quantity: z.number(),
  tier: z.enum(["basic", "pro"]),
  notes: z.string().optional(),
  shipping: z.object({ city: z.string() }),
  name: z.string().min(3).max(12),
  score: z.int().gt(0),
  discount: z.number().max(50),
  tags: z.array(z.string()).min(1),
});

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, ".generated");
fs.mkdirSync(dir, { recursive: true });

// The schema module the generated pair imports.
fs.writeFileSync(
  path.join(dir, "orderSchema.ts"),
  [
    `import { z } from "zod";`,
    "",
    "export const orderSchema = z.object({",
    "  email: z.email(),",
    "  quantity: z.number(),",
    `  tier: z.enum(["basic", "pro"]),`,
    "  notes: z.string().optional(),",
    "  shipping: z.object({ city: z.string() }),",
    "  name: z.string().min(3).max(12),",
    "  score: z.int().gt(0),",
    "  discount: z.number().max(50),",
    "  tags: z.array(z.string()).min(1),",
    "});",
    "",
  ].join("\n"),
  "utf8",
);

const ir = fromZod(schema);
const schemaImport = {
  name: "orderSchema",
  from: "./orderSchema",
  kind: "named",
} as const;

fs.writeFileSync(
  path.join(dir, "OrderForm.tsx"),
  emitPlainForm({ ir, formName: "OrderForm", schemaImport }),
  "utf8",
);
fs.writeFileSync(
  path.join(dir, "OrderForm.test.tsx"),
  emitComponentSpec({
    runner: "vitest",
    formName: "OrderForm",
    schemaImport,
    ir,
    plan: collectTestPlan(ir),
    componentImport: "./OrderForm",
    skipRender: false,
    asyncSchema: false,
    optionsProps: [],
  }),
  "utf8",
);

// Importing the spec registers its describe/it blocks in this run. The
// specifier is a variable on purpose: a literal would be resolved during
// THIS module's transform, before the writes above have produced the file.
const specModule = "./.generated/OrderForm.test.tsx";
await import(/* @vite-ignore */ specModule);
