// The intermediate representation both frontends (zod runtime walk, TS
// compiler API walk) produce and all code emitters consume.

export type SharedSpecProps = Readonly<{
  optional: boolean;
  nullable: boolean;
  // Set when the source construct wasn't representable — emitters surface it
  // as a `// TODO: ...` comment next to the generated fallback.
  todo?: string;
}>;

export type NamedField = Readonly<{
  name: string;
  label: string;
  spec: FieldSpec;
}>;

export type FieldSpec =
  | (SharedSpecProps & Readonly<{ kind: "string" }>)
  | (SharedSpecProps & Readonly<{ kind: "number" }>)
  | (SharedSpecProps & Readonly<{ kind: "boolean" }>)
  | (SharedSpecProps & Readonly<{ kind: "date" }>)
  | (SharedSpecProps & Readonly<{ kind: "enum"; options: readonly string[] }>)
  | (SharedSpecProps &
      Readonly<{ kind: "object"; fields: readonly NamedField[] }>)
  | (SharedSpecProps & Readonly<{ kind: "array"; item: FieldSpec }>);

const capitalize = (word: string): string =>
  word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);

// "firstName" / "first_name" / "first-name" / "APIKey" → "First Name" etc.
export const labelFromName = (name: string): string =>
  name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map(capitalize)
    .join(" ");
