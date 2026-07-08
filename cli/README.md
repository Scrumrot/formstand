# formstand-cli

Generate [formstand](https://scrumrot.github.io/formstand/) form components from a zod schema or a TypeScript type.

```bash
npm install --save-dev formstand-cli
```

## Requirements

- **formstand >= 0.3.0** for `--ui mui` and `--ui shadcn` output (the inlined adapters use `UseFieldReturn`, `numberToInputText`, and `parseNumberText`); plain output works on 0.2.0.
- **zod v4** in your project. The CLI walks your schema structurally (duck-typed by design — no `instanceof` against a bundled copy), so it does not ship zod itself: the schema module and the generated code both use the zod your project supplies.

## Two modes

### 1. Zod mode (default)

Point it at a module that exports a zod schema; it prints a complete, compilable component bound to that schema:

```bash
formstand-gen src/profileSchema.ts
formstand-gen src/profileSchema.ts --out src/ProfileForm.tsx
formstand-gen src/schemas.ts --export profileSchema --name ProfileForm --out src/ProfileForm.tsx
```

The schema module is loaded at runtime (via jiti, so plain `.ts` files work) and walked structurally — your own copy of zod is used, no `instanceof` games. Picked export: `--export`, else the default export, else the sole zod-schema export.

### 2. Type mode

Point it at an exported TypeScript `type`/`interface`; it generates a zod schema **and** a component that imports it:

```bash
formstand-gen src/types.ts --type Profile --out src/ProfileForm.tsx
# writes src/profileSchema.ts (override with --schema-out) and src/ProfileForm.tsx
```

Without `--out`, both files print to stdout separated by `// --- file: ...` headers. With `--schema-out` but no `--out`, the schema is written to that file and the component streams to stdout.

## Flags

| Flag | Meaning |
| --- | --- |
| `--export <name>` | which export holds the zod schema |
| `--type <TypeName>` | generate from a TS type/interface instead |
| `--ui plain\|mui\|shadcn` | component flavor (default `plain`) |
| `--name <MyForm>` | component name (default derived from the schema/type name) |
| `--out <file>` | write the component here instead of stdout |
| `--schema-out <file>` | type mode: where the generated zod schema goes (default `<schemaName>.ts` next to `--out`) |
| `--force` | overwrite existing output files |

## What is generated

- `useForm` + typed `initialValues` (strings `""`, booleans `false`, numbers/dates/enums `undefined`, nullable fields `null`, arrays `[]`).
- One bound control per field: `TextField`, `NumberField`, `CheckboxField`, `SelectField` (enum options from the schema).
- Nested objects as `<fieldset>`/`<legend>` sections.
- Field arrays via `useFieldArray` with stable row keys, add/remove buttons, and a typed empty-item constant.
- `handleSubmit(console.log)` and a submit button disabled while submitting.
- `--ui mui`: the same structure over `@mui/material` v9 with an inlined ~50-line adapter (`muiTextFieldProps` / `muiNumberFieldProps` / `muiSelectProps` / `muiSwitchProps`) binding `UseFieldReturn` to MUI props, sharing `parseNumberText` / `numberToInputText` with the library.
- `--ui shadcn`: the same structure over your app's [shadcn/ui](https://ui.shadcn.com/) components (imported from the `@/components/ui/*` alias that `npx shadcn add` scaffolds) with an inlined adapter speaking the Radix dialect — `onCheckedChange` / `onValueChange` callbacks, dropdown-close as the blur trigger, and `aria-invalid` error styling with a message line.

## Supported schema surface

`string`, `number`/`int`, `boolean`, `date`, `enum`, unions of string literals, `object`, `array`, with `.optional()` / `.nullable()` / `.default()` / `.pipe()` unwrapped. Anything else falls back to a string field with a `// TODO:` comment so the file still compiles. `date` fields render a text input with a `// TODO: date input` marker. Arrays nested inside array rows are emitted as TODO comments (extract a row component for those).

Known limitations:

- **Dots in keys**: formstand paths split on `.`, so a field named `"a.b"` is not path-addressable. The key is kept in the zod schema and `initialValues`, but no control is bound — a `{/* TODO: field "a.b" skipped ... */}` comment marks the spot and the CLI prints a warning.
- **Tuples** (type mode): `[string, number]` degrades to a string field with a `// TODO: tuple — not supported` comment. Methods and callable types are skipped / degraded the same way.

## Programmatic API

```ts
import { fromZod, fromType, emitPlainForm, emitMuiForm, emitShadcnForm, emitZodSchema } from "formstand-cli";

const ir = fromZod(profileSchema);
const code = emitPlainForm({
  ir,
  formName: "ProfileForm",
  schemaImport: { name: "profileSchema", from: "./profileSchema", kind: "named" },
});
```

## Roadmap

- Date pickers for `date` fields (MUI X; shadcn Calendar-in-Popover).
- Custom templates.

MIT
