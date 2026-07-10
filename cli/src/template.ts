// Custom templates: the escape hatch for UI kits formstand-cli doesn't ship
// built in (Mantine, Chakra, an in-house design system). A template
// OVERRIDES the per-kind field rendering and declares the imports its
// controls need; everything else — the form scaffold, sections, arrays,
// discriminated-union handling, initial values, the schema — is inherited
// from the plain backend. This is the leaf-override model: a UI kit differs
// in its field components, not the form skeleton.
//
//   // mantine.template.ts
//   import { defineTemplate } from "formstand-cli";
//   export default defineTemplate({
//     name: "mantine",
//     imports: [{ from: "@mantine/core", names: ["TextInput", "NumberInput"] }],
//     leaf: {
//       string: ({ label, bind }) => `<TextInput label={${label}} {...${bind}} />`,
//       number: ({ label, bind }) => `<NumberInput label={${label}} {...${bind}} />`,
//     },
//   });
//   // npx formstand-gen schema.ts --template ./mantine.template.ts

// The scalar kinds a template can render. Objects/arrays/unions are structure
// the engine owns; a template never sees them.
export type TemplateLeafKind = "string" | "number" | "boolean" | "date" | "enum";

// The context a leaf renderer receives. Every field is a STRING to splice
// into JSX — the values are written so the same template works both inside a
// generated Bound* wrapper component (where `field`/`label` are props) and
// inside a discriminated-union block (where they are concrete values), so
// `label={${label}}` / `{...${bind}}` are correct in both.
export type TemplateLeafContext = Readonly<{
  kind: TemplateLeafKind;
  // The bound `useField` result variable (`"field"` inside a wrapper; the
  // hoisted variant variable inside a union). Reference `.error`, `.value`,
  // etc. off it for custom error/validation display.
  field: string;
  // The formstand prop-builder spread for this kind, already applied to
  // `field` — `"textInputProps(field)"` etc. Spread it onto your control:
  // `{...${bind}}`. Carries name/value/onChange/onBlur/aria-invalid.
  bind: string;
  // The field label, as a JS EXPRESSION (a prop reference or a quoted
  // string) — write `label={${label}}`, not `label="${label}"`.
  label: string;
  // enum only: the options, as a JS expression evaluating to `string[]`
  // (a prop reference or an array literal). `""` for non-enum kinds.
  // Build your kit's option markup from it, e.g. Mantine `data={${options}}`.
  options: string;
}>;

export type TemplateImport = Readonly<{
  from: string;
  names: readonly string[];
}>;

export type Template = Readonly<{
  // Distinguishes the template in generated comments and errors.
  name: string;
  // Imports every rendered control needs (deduped and merged with
  // formstand's own). Type-only names should be written as `type Foo`.
  imports?: readonly TemplateImport[];
  // Per-kind renderers returning the control's JSX. Return a string or an
  // array of lines. Unlisted kinds fall back to the plain backend's control,
  // so a template can override just the kinds its kit changes.
  leaf: Partial<
    Record<
      TemplateLeafKind,
      (ctx: TemplateLeafContext) => string | readonly string[]
    >
  >;
}>;

// Identity with types — completion and typo-checking in the template file.
export const defineTemplate = (template: Template): Template => template;

// Runtime validation for a loaded template module (a plain object from an
// untyped .ts file): shape-checks so a malformed template fails as loudly as
// a bad flag, at generation time, with a clear message.
export const isTemplate = (value: unknown): value is Template => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record["name"] !== "string") return false;
  if (typeof record["leaf"] !== "object" || record["leaf"] === null) {
    return false;
  }
  const leaf = record["leaf"] as Readonly<Record<string, unknown>>;
  const kinds: readonly TemplateLeafKind[] = [
    "string",
    "number",
    "boolean",
    "date",
    "enum",
  ];
  if (
    Object.keys(leaf).some(
      (key) =>
        !(kinds as readonly string[]).includes(key) ||
        typeof leaf[key] !== "function",
    )
  ) {
    return false;
  }
  const imports = record["imports"];
  return (
    imports === undefined ||
    (Array.isArray(imports) &&
      imports.every(
        (line) =>
          typeof line === "object" &&
          line !== null &&
          typeof (line as Readonly<Record<string, unknown>>)["from"] ===
            "string" &&
          Array.isArray((line as Readonly<Record<string, unknown>>)["names"]),
      ))
  );
};
