# formstand-cli

Generate [formstand](https://scrumrot.github.io/formstand/) form components from a zod schema or a TypeScript type.

```bash
npm install --save-dev formstand-cli
```

## Requirements

- **formstand >= 0.3.0** for `--ui mui` and `--ui shadcn` output (the inlined adapters use `UseFieldReturn`, `numberToInputText`, and `parseNumberText`); plain output works on 0.2.0. Generated `useFieldArray` hooks get typed items on **formstand >= 0.5** (inferred from the schema through the path); on 0.4 they compile with untyped items.
- **formstand >= 0.9** for `date` fields: plain output emits `<DateField>` and the mui/shadcn adapters use `dateToInputText` / `parseDateText`, all shipped in 0.9. On older formstand, avoid `z.date()` in the schema (or replace the emitted date bindings by hand).
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
| `--layout single\|module` | `single` (default): one file. `module`: a feature-module folder — see below |
| `--sections flat\|panel\|collapsible` | section chrome: `flat` headings (default), bordered `panel`s, or `collapsible` sections (`<details>`; MUI `Accordion`) |
| `--columns 1\|2\|3` | evenly spaced field columns inside each section (default `1`); nested sections span the full row |
| `--name <MyForm>` | component name (default derived from the schema/type name) |
| `--out <file>` | write the component here instead of stdout |
| `--schema-out <file>` | type mode: where the generated zod schema goes (default `<schemaName>.ts` next to `--out`) |
| `--config <file>` | config file (default: `formstand.config.{ts,mts,js,mjs}` in the working directory) holding project defaults for `ui`/`layout`/`sections`/`columns`; explicit flags win |
| `--watch` | regenerate whenever the input file changes (requires `--out`) |
| `--template <file>` | a custom template module (`defineTemplate`) for a UI kit formstand doesn't ship — overrides the per-kind field rendering, inheriting the plain form scaffold; `--layout single` only, overrides `--ui` |
| `--force` | overwrite existing output files |

## What is generated

- `useForm` + typed `initialValues` (strings `""`, booleans `false`, numbers/dates/enums `undefined`, nullable fields `null`, arrays `[]`).
- One bound control per field: `TextField`, `NumberField`, `CheckboxField`, `SelectField` (enum options from the schema).
- Nested objects as `<fieldset>`/`<legend>` sections.
- Field arrays via `useFieldArray` with stable row keys, add/remove buttons, and a typed empty-item constant.
- `--sections` / `--columns` pick each section's chrome and field grid, in the ui's own dialect: inline styles for `plain`, `Card`/`Accordion` + `sx` grids for `mui`, Tailwind classes (`md:grid-cols-2`, `bg-card`) for `shadcn`. Both flags work with either `--layout`.
- `handleSubmit(console.log)` and a submit button disabled while submitting.
- `--ui mui`: the same structure over `@mui/material` v9 with an inlined ~50-line adapter (`muiTextFieldProps` / `muiNumberFieldProps` / `muiSelectProps` / `muiSwitchProps`) binding `UseFieldReturn` to MUI props, sharing `parseNumberText` / `numberToInputText` with the library.
- `--ui shadcn`: the same structure over your app's [shadcn/ui](https://ui.shadcn.com/) components (imported from the `@/components/ui/*` alias that `npx shadcn add` scaffolds) with an inlined adapter speaking the Radix dialect — `onCheckedChange` / `onValueChange` callbacks, dropdown-close as the blur trigger, and `aria-invalid` error styling with a message line.

## `--layout module`

Instead of one file, a feature-module folder in the shape of the [Onboarding playground demo](https://github.com/Scrumrot/formstand/tree/main/examples/src/forms/OnboardingForm):

```
ProfileForm/
  schema.ts        the zod schema (re-exported in zod mode, generated in type mode)
  types.ts         ProfileSchema / ProfileValues
  hooks.ts         createForm + createFormHooks(form, "profile") — the pre-wired hook API
  fields/          one file per scalar leaf: props type + field hook + component
  sections/        one per top-level object/array: props type + section hook
                   (path-scoped useProfileIsDirty/IsValid) + component
  ProfileForm.tsx  the body composing sections and root-level fields
  index.ts         the folder's public API
```

`--out` names the folder (created if missing; every destination is checked before anything is written). Without `--out`, all files stream to stdout with `// --- file:` headers. Array sections bind their row fields inline with template paths; `date` fields get real `DateField` / date-input bindings (formstand ≥ 0.9). Works with **all three uis** — `mui` and `shadcn` modules get a shared `adapter.ts(x)` exporting the generic prop builders instead of inlining them per file. Requires **formstand ≥ 0.7** (`createFormHooks`).

```bash
formstand-gen src/profileSchema.ts --layout module --out src/ProfileForm
formstand-gen src/types.ts --type Profile --layout module --out src/ProfileForm
formstand-gen src/profileSchema.ts --ui mui --sections panel --columns 2 --layout module --out src/ProfileForm
```

## Config file

Project defaults live in `formstand.config.ts` next to where you run the CLI (flags always win):

```ts
import { defineConfig } from "formstand-cli";

export default defineConfig({
  ui: "mui",
  layout: "module",
  sections: "panel",
  columns: 2,
});
```

`defineConfig` is an identity function with types — completion and typo-checking in the config file. Pair it with `--watch` for schema-first development: edit the schema, the module regenerates.

## Custom templates

For a UI kit formstand doesn't ship built in — Mantine, Chakra, an in-house design system — a **template** overrides the per-kind field rendering while inheriting the generated form's scaffold (sections, arrays, discriminated unions, submit). A UI kit differs in its field components, not the form skeleton.

```ts
// mantine.template.ts
import { defineTemplate } from "formstand-cli";

export default defineTemplate({
  name: "mantine",
  imports: [{ from: "@mantine/core", names: ["TextInput", "NumberInput", "Select"] }],
  leaf: {
    string: ({ label, bind }) => `<TextInput label={${label}} {...${bind}} />`,
    number: ({ label, bind }) => `<NumberInput label={${label}} {...${bind}} />`,
    enum: ({ label, bind, options }) => `<Select label={${label}} data={${options}} {...${bind}} />`,
    // string / number / boolean / date / enum — unlisted kinds fall back to plain
  },
});
```

```bash
formstand-gen src/profileSchema.ts --template ./mantine.template.ts --out src/ProfileForm.tsx
```

Each `leaf` renderer receives a context whose fields are **JS-expression strings** to splice into your control's JSX:

- `bind` — the formstand prop-builder spread (`textInputProps(field)` etc.), carrying `name`/`value`/`onChange`/`onBlur`/`aria-invalid`. Spread it: `{...${bind}}`.
- `field` — the bound `useField` result variable; reference `.error` / `.value` for custom error display.
- `label` — the field label as an expression: write `label={${label}}`.
- `options` — enum only: a `string[]` expression (`data={${options}}`).

Unlisted kinds fall back to the plain output, so a template can override only the kinds its kit changes. `--template` overrides `--ui` and currently supports `--layout single` (module support is planned). Set a project default with `template: "./mantine.template.ts"` in `formstand.config.ts`.

## Supported schema surface

`string`, `number`/`int`, `boolean`, `date`, `enum`, unions of string literals, `object`, `array`, with `.optional()` / `.nullable()` / `.default()` / `.pipe()` unwrapped. Anything else falls back to a string field with a `// TODO:` comment so the file still compiles. `date` fields emit a real `DateField` (plain) or date-input binding (mui / shadcn) — no TODO (requires formstand ≥ 0.9). Arrays nested inside array rows: the **module layout** (`--layout module`) extracts a parented row component with its own `useFieldArray` for the first level of nesting; deeper levels — and the single-file layout — emit a TODO to extract the row component by hand.

Known limitations:

- **Dots in keys**: formstand paths split on `.`, so a field named `"a.b"` is not path-addressable. The key is kept in the zod schema and `initialValues`, but no control is bound — a `{/* TODO: field "a.b" skipped ... */}` comment marks the spot and the CLI prints a warning.
- **Tuples** (type mode): `[string, number]` degrades to a string field with a `// TODO: tuple — not supported` comment. Methods and callable types are skipped / degraded the same way.

## Programmatic API

The generator is exposed as two entry points.

**`formstand-cli/codegen`** — the browser-safe surface. Everything downstream of the IR is a pure string builder (no `fs`/`path`, no TypeScript compiler), so this subpath runs anywhere — a browser, a build script, your own tool. The pipeline is `zod schema → fromZod → FieldSpec IR → emitters`; build a `FieldSpec` by hand or from `fromZod`, then run any emitter:

```ts
import { fromZod, emitPlainForm, emitModuleForm, emitZodSchema } from "formstand-cli/codegen";

const ir = fromZod(profileSchema);
const code = emitPlainForm({
  ir,
  formName: "ProfileForm",
  schemaImport: { name: "profileSchema", from: "./profileSchema", kind: "named" },
});
```

This is exactly how the docs' [Schema builder](https://scrumrot.github.io/formstand/examples/#/schema-builder) generates forms client-side. Exports: `fromZod` / `isZodSchema`, `emitPlainForm` / `emitMuiForm` / `emitShadcnForm` / `emitTemplateForm` / `emitModuleForm`, `emitZodSchema` / `emitInitialValues`, `joinModuleFiles`, `defineTemplate`, `labelFromName` and the casing helpers, and the `FieldSpec` / `EmitFormOptions` / `VisualOptions` types.

**`formstand-cli`** (the main entry) re-exports all of the above **and** adds the parts that need Node / the TypeScript compiler:

```ts
import { fromType, defineConfig } from "formstand-cli";

const { ir, typeName } = fromType("./types.ts", "Profile"); // parses TS via the compiler
```

Import from `formstand-cli/codegen` for a browser bundle — the main entry pulls the TypeScript compiler through `fromType` and won't bundle for the browser.

## License

MIT
