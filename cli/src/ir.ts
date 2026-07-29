import { capitalize, splitWords } from "./casing";

// The intermediate representation both frontends (zod runtime walk, TS
// compiler API walk) produce and all code emitters consume.

// A per-field component override, resolved from formstand.config.ts `fields`
// by applyFieldOverrides (see ./overrides) and stamped onto the matched
// string/enum leaf. "autocomplete" is the only flavor today (free text with
// suggestions — the field stays a string; strict select-from-list remains
// the enum/Select path); the discriminated shape leaves room for future
// flavors (textarea, slider, ...).
export type FieldOverrideSpec = Readonly<{
  component: "autocomplete";
  // Present when the generated component takes a `{name}: readonly string[]`
  // prop feeding the suggestions (required for plain string fields — no
  // other options source exists; optional for enums, where it REPLACES the
  // baked-in enum values). The name is already collision-resolved.
  optionsPropName?: string;
}>;

export type SharedSpecProps = Readonly<{
  optional: boolean;
  nullable: boolean;
  // Set when the source construct wasn't representable — emitters surface it
  // as a `// TODO: ...` comment next to the generated fallback.
  todo?: string;
  // The runtime value of a `.default()` / `.prefault()` wrapper. Zod mode
  // only — TS types can't carry runtime defaults, so fromType never sets it.
  // emitInitialValues seeds the field with it when it is a JSON-serializable
  // primitive matching the field kind (string / finite number / boolean /
  // declared enum option); anything else (dates, objects, arrays) keeps the
  // blank-form behavior.
  defaultValue?: unknown;
  // Set when a `.default()` / `.prefault()` wrapper existed but the capture
  // guard refused its value (a function-valued resolved default, a
  // non-deterministic factory whose two reads disagreed, or a throwing
  // getter). Refusals decided later, at emit time (kind mismatch, todo
  // fallback), are detected off `defaultValue` instead — see codegen's
  // droppedDefaultFieldPaths, which mirrors both as stderr warnings.
  droppedDefault?: true;
  // Human helper text for the field, captured from zod's `.describe()` /
  // `.meta({ description })` (one registry store in zod v4 — see fromZod's
  // capture note for the wrapper-precedence rule) or, in type mode, from the
  // member's leading JSDoc description. Emitters surface it in each kit's
  // helper-text slot; where the kit shares one slot with the error line, the
  // error wins while present.
  description?: string;
  // Set by applyFieldOverrides when formstand.config.ts `fields` names this
  // leaf: the emitters swap the kind's default control for the override's
  // component. Only ever present on string/enum leaves (validated loudly).
  override?: FieldOverrideSpec;
}>;

export type NamedField = Readonly<{
  name: string;
  label: string;
  spec: FieldSpec;
}>;

// One branch of a discriminated union at a field position: `tag` is the
// literal discriminant value ("card"), `label` its title-cased form, and
// `fields` the branch's fields EXCLUDING the discriminant key (that binds
// with a plain field; the branch fields bind with useVariantField).
export type UnionVariant = Readonly<{
  tag: string;
  label: string;
  fields: readonly NamedField[];
}>;

export type FieldSpec =
  | (SharedSpecProps & Readonly<{ kind: "string" }>)
  | (SharedSpecProps & Readonly<{ kind: "number" }>)
  | (SharedSpecProps & Readonly<{ kind: "boolean" }>)
  | (SharedSpecProps & Readonly<{ kind: "date" }>)
  | (SharedSpecProps & Readonly<{ kind: "enum"; options: readonly string[] }>)
  | (SharedSpecProps &
      Readonly<{ kind: "object"; fields: readonly NamedField[] }>)
  | (SharedSpecProps & Readonly<{ kind: "array"; item: FieldSpec }>)
  // A fixed-arity, heterogeneous positional list (z.tuple / [A, B]). Each
  // element binds at a static numeric-index path (`coord.0`, `coord.1`),
  // unlike an array's variable-length dynamic rows.
  | (SharedSpecProps &
      Readonly<{ kind: "tuple"; elements: readonly FieldSpec[] }>)
  | (SharedSpecProps &
      Readonly<{
        kind: "union";
        discriminant: string;
        variants: readonly UnionVariant[];
      }>);

// "firstName" / "first_name" / "first-name" / "APIKey" → "First Name" etc.
// (One splitting rule for the whole CLI — see ./casing.)
export const labelFromName = (name: string): string =>
  splitWords(name).map(capitalize).join(" ");
