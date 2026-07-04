import { capitalize, splitWords } from "./casing";

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

// "firstName" / "first_name" / "first-name" / "APIKey" → "First Name" etc.
// (One splitting rule for the whole CLI — see ./casing.)
export const labelFromName = (name: string): string =>
  splitWords(name).map(capitalize).join(" ");
