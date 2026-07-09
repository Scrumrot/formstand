import { z } from "zod";

// The schema builder's own zod schema: a form describing a form. Its values
// map 1:1 onto the CLI's FieldSpec IR (see ./generate), so the playground
// runs the real formstand-gen emitters in the browser with no parsing step.

export const FIELD_KINDS = [
  "string",
  "number",
  "boolean",
  "date",
  "enum",
] as const;

// Field names become identifiers, object keys, and formstand paths — and
// paths split on ".", so dots are the one thing the CLI can't address.
const nameField = z
  .string()
  .min(1, "needs a name")
  .regex(
    /^[A-Za-z_$][A-Za-z0-9_$]*$/,
    "letters, digits, and _ only (it becomes an identifier and a path segment)",
  );

export const parseEnumOptions = (raw: string): readonly string[] =>
  raw
    .split(",")
    .map((option) => option.trim())
    .filter((option) => option.length > 0);

const fieldRowSchema = z.object({
  name: nameField,
  kind: z.enum(FIELD_KINDS),
  optional: z.boolean(),
  // Comma-separated enum options; only read when kind === "enum" (the
  // cross-field rule lives in the superRefine below so the error lands on
  // this row's input).
  options: z.string(),
});

const sectionRowSchema = z.object({
  name: nameField,
  kind: z.enum(["object", "array"]),
  fields: z.array(fieldRowSchema).min(1, "a section needs at least one field"),
});

type FieldRowInput = z.input<typeof fieldRowSchema>;

const requireEnumOptions = (
  rows: readonly FieldRowInput[],
  base: readonly (string | number)[],
  ctx: z.RefinementCtx,
): void =>
  rows.forEach((row, index) => {
    if (row.kind === "enum" && parseEnumOptions(row.options).length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "a select needs comma-separated options",
        path: [...base, index, "options"],
      });
    }
  });

const requireUniqueNames = (
  names: readonly string[],
  pathFor: (index: number) => readonly (string | number)[],
  ctx: z.RefinementCtx,
): void =>
  names.forEach((name, index) => {
    if (name.length > 0 && names.slice(0, index).includes(name)) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate name "${name}"`,
        path: [...pathFor(index)],
      });
    }
  });

export const builderSchema = z
  .object({
    formName: z
      .string()
      .min(1, "name the component")
      .regex(/^[A-Z][A-Za-z0-9]*$/, "PascalCase, e.g. ContactForm"),
    ui: z.enum(["plain", "mui", "shadcn"]),
    layout: z.enum(["single", "module"]),
    sectionStyle: z.enum(["flat", "panel", "collapsible"]),
    columns: z.enum(["1", "2", "3"]),
    rootFields: z.array(fieldRowSchema),
    sections: z.array(sectionRowSchema),
  })
  .superRefine((values, ctx) => {
    if (values.rootFields.length === 0 && values.sections.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "add at least one field or section",
        path: ["formName"],
      });
    }
    requireEnumOptions(values.rootFields, ["rootFields"], ctx);
    values.sections.forEach((section, index) =>
      requireEnumOptions(section.fields, ["sections", index, "fields"], ctx),
    );
    // Root fields and sections share the schema's object root.
    requireUniqueNames(
      [
        ...values.rootFields.map((row) => row.name),
        ...values.sections.map((section) => section.name),
      ],
      (index) =>
        index < values.rootFields.length
          ? ["rootFields", index, "name"]
          : ["sections", index - values.rootFields.length, "name"],
      ctx,
    );
    values.sections.forEach((section, index) =>
      requireUniqueNames(
        section.fields.map((row) => row.name),
        (fieldIndex) => ["sections", index, "fields", fieldIndex, "name"],
        ctx,
      ),
    );
  });

export type BuilderValues = z.input<typeof builderSchema>;

export const blankField: BuilderValues["rootFields"][number] = {
  name: "",
  kind: "string",
  optional: false,
  options: "",
};

export const blankSection: BuilderValues["sections"][number] = {
  name: "",
  kind: "object",
  fields: [blankField],
};

// A worked example so the tab generates something on first paint.
export const initialBuilderValues: BuilderValues = {
  formName: "ContactForm",
  ui: "mui",
  layout: "module",
  sectionStyle: "panel",
  columns: "2",
  rootFields: [
    { name: "fullName", kind: "string", optional: false, options: "" },
    { name: "email", kind: "string", optional: false, options: "" },
  ],
  sections: [
    {
      name: "address",
      kind: "object",
      fields: [
        { name: "street", kind: "string", optional: false, options: "" },
        { name: "city", kind: "string", optional: false, options: "" },
        { name: "postalCode", kind: "string", optional: true, options: "" },
      ],
    },
    {
      name: "phones",
      kind: "array",
      fields: [
        { name: "number", kind: "string", optional: false, options: "" },
        {
          name: "type",
          kind: "enum",
          optional: false,
          options: "mobile, home, work",
        },
      ],
    },
  ],
};
