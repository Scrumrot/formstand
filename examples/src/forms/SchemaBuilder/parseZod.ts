import { z } from "zod";
import {
  type FieldSpec,
  fromZod,
  isZodSchema,
  pascalCase,
} from "../../../../cli/src/codegen-api";

// The "I already have a zod schema" entry to the Schema builder. The user
// pastes a `z.object({ ... })` (their own code, in their own tab), we
// evaluate it against the bundled zod, then hand the runtime schema to the
// REAL `fromZod` — the same walk `npx formstand-gen schema.ts` runs. So this
// mode shares the paste-TS mode's ParseResult contract and the identical
// IR -> emitters path; only the frontend differs.
//
// Evaluation is `new Function("z", ...)`: the pasted source is the user's own
// code running in their own browser with nothing but the bundled `z` passed
// in — the REPL trust model. No source is fetched, sent, or persisted; the
// worst a paste can do is what the user could already do in their own devtools
// console. That is the same bargain the paste-TS parser makes, without the
// multi-megabyte TypeScript compiler.

export type ParseResult =
  | Readonly<{ ok: true; formName: string; ir: FieldSpec }>
  | Readonly<{ ok: false; error: string }>;

// Drop `import ...` lines (people paste `import { z } from "zod"` with their
// schema) and unwrap `export ` so `export const x = ...` evaluates as a plain
// declaration. Purely textual — line-oriented, good enough for pasted source.
const stripImportsAndExports = (source: string): string =>
  source
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .map((line) => line.replace(/^\s*export\s+/, ""))
    .join("\n");

// The name of the LAST top-level `const/let/var NAME =` — the schema is
// almost always the final declaration (`const contactSchema = z.object(...)`).
// Used both to know what to return from the evaluated body and to name the
// component. Returns null for a bare expression paste.
const lastBindingName = (source: string): string | null => {
  const matches = Array.from(
    source.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g),
  );
  const last = matches.at(-1);
  return last !== undefined ? last[1]! : null;
};

// `contactSchema` / `ContactSchema` / `Contact` -> `ContactForm`. Strip a
// trailing Schema/Shape suffix, PascalCase, then ensure a single Form suffix.
const formNameFromBinding = (binding: string | null): string => {
  const stem = (binding ?? "").replace(/(schema|shape)$/i, "");
  const pascal = pascalCase(stem);
  const base = pascal.length === 0 ? "Schema" : pascal;
  return base.endsWith("Form") ? base : `${base}Form`;
};

// Evaluate the pasted source with `z` in scope and return whatever schema it
// produces: the last binding if there is one, else the source as an
// expression. Any throw (syntax or runtime) is surfaced as a parse error.
const evaluateSchema = (
  cleaned: string,
  binding: string | null,
): Readonly<{ ok: true; schema: unknown }> | Readonly<{ ok: false; error: string }> => {
  const body =
    binding !== null ? `${cleaned}\nreturn ${binding};` : `return (\n${cleaned}\n);`;
  try {
    // eslint-disable-next-line no-new-func -- REPL trust model; see file header.
    const run = new Function("z", body) as (zod: typeof z) => unknown;
    return { ok: true, schema: run(z) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Could not evaluate the schema: ${message}` };
  }
};

export const parseZod = (source: string): ParseResult => {
  const cleaned = stripImportsAndExports(source).trim();
  if (cleaned.length === 0) {
    return { ok: false, error: "Paste a zod schema, e.g. z.object({ name: z.string() })" };
  }
  // The binding drives both what the evaluated body returns and the form
  // name, so read it once from the cleaned (export-stripped) source.
  const binding = lastBindingName(cleaned);
  const evaluated = evaluateSchema(cleaned, binding);
  if (!evaluated.ok) return evaluated;
  if (!isZodSchema(evaluated.schema)) {
    return {
      ok: false,
      error:
        "That evaluated, but it isn't a zod schema. The last declaration should be a z.* schema (a z.object(...) at the top level).",
    };
  }
  const ir = fromZod(evaluated.schema);
  if (ir.kind !== "object" || ir.fields.length === 0) {
    return {
      ok: false,
      error: "The top-level schema must be a z.object({ ... }) with at least one field.",
    };
  }
  return { ok: true, formName: formNameFromBinding(binding), ir };
};
