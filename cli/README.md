# formstand-cli

Generate [formstand](https://scrumrot.github.io/formstand/) form components from a zod schema, a TypeScript type, or a JSON Schema / OpenAPI document.

```bash
npm install --save-dev formstand-cli    # the binary is named formstand-gen
```

**Full docs: [scrumrot.github.io/formstand/documentation/cli](https://scrumrot.github.io/formstand/documentation/cli/)** · **[Try it in the browser](https://scrumrot.github.io/formstand/examples/#/schema-builder)**

It is a one-shot generator. The file it writes is yours: no markers, no regeneration
magic, and nothing in the output imports from this package.

## Three modes

**Zod mode (default).** Point it at a module that exports a zod schema and it prints a
complete, compilable component bound to that schema:

```bash
formstand-gen src/profileSchema.ts --out src/ProfileForm.tsx
formstand-gen src/schemas.ts --export profileSchema --name ProfileForm --out src/ProfileForm.tsx
```

The module is loaded at runtime through jiti, so plain `.ts` files work, and walked
structurally against your own copy of zod. Picked export: `--export`, else the default
export, else the sole zod-schema export.

**Type mode.** Point it at an exported `type` or `interface` and it generates a zod
schema **and** a component that imports it:

```bash
formstand-gen src/types.ts --type Profile --out src/ProfileForm.tsx
# writes src/profileSchema.ts (override with --schema-out) and src/ProfileForm.tsx
```

**JSON Schema mode.** Point it at a `.json` file holding a JSON Schema (2020-12) or an
OpenAPI 3.x document. Like type mode, it generates the zod schema beside the component;
`--schema` picks a component schema by name, or anything else by `#/...` pointer:

```bash
formstand-gen api.json --schema Order --out src/OrderForm.tsx
```

Without `--out`, output streams to stdout with `// --- file:` headers. Warnings go to
stderr, so redirection stays clean, and writes are all-or-nothing: if any destination
exists and `--force` isn't set, nothing is written.

## Flags

| Flag | Meaning |
| --- | --- |
| `--export <name>` | which export holds the zod schema |
| `--type <TypeName>` | generate from a TS type or interface instead |
| `--schema <name\|#/pointer>` | `.json` input: which schema in the document to generate from |
| `--ui <kit>` | `plain` (default), `mui[@5\|6\|7\|9]`, `shadcn`, `chakra`, `mantine`, `antd` |
| `--layout single\|module` | one file (default), or a feature-module folder |
| `--sections flat\|panel\|collapsible` | section chrome, default `flat` |
| `--columns 1\|2\|3` | field columns inside each section, default `1` |
| `--live` | no submit scaffold; adds an `onValuesChange` prop and defaults the mode to `"onChange"` |
| `--form-prop` | the page owns the form: adds a `form` prop and exports a `use{Name}Form()` hook |
| `--name <MyForm>` | component name, default derived from the schema or type |
| `--out <file>` | write here instead of stdout; names the folder under `--layout module` |
| `--schema-out <file>` | type and `.json` modes: where the generated schema goes |
| `--max-depth <n>` | nesting budget before a level degrades to a string plus a TODO |
| `--config <file>` | config file, default `formstand.config.{ts,mts,js,mjs}` |
| `--template <file>` | a custom template for a kit formstand doesn't ship; `--layout single` only |
| `--watch` | regenerate whenever the input changes; requires `--out` |
| `--force` | overwrite existing output files |
| `--wizard` | ask the flag questions interactively, one at a time; runs alone |
| `--help` | usage |

Every flag is documented in full on the
[command reference](https://scrumrot.github.io/formstand/documentation/cli/reference).

## What you get

`useForm` with typed `initialValues` (blank values matching each field's kind, and
`.default()` honored when the value is a safe literal), one bound control per field,
nested objects as sections, arrays via `useFieldArray` with stable row keys and add and
remove buttons, zod descriptions rendered as helper text, and a wired submit.

Supported schema surface: `string`, `number`/`int`, `boolean`, `date`, `enum`, unions of
string literals, `object`, `array`, and `tuple`, with `.optional()`, `.nullable()`,
`.default()`, and `.pipe()` unwrapped. Anything outside it degrades **loudly**, to a text
field with a `// TODO` naming what was skipped, so the file still compiles. See
[how unsupported shapes degrade](https://scrumrot.github.io/formstand/documentation/cli/reference#how-unsupported-shapes-degrade).

## UI kits

| `--ui` | Target | What your app supplies |
| --- | --- | --- |
| `plain` | formstand's own components | nothing |
| `mui` | Material UI 5, 6, 7, or 9 | `@mui/material` and your theme |
| `shadcn` | shadcn/ui conventions | components from `npx shadcn add` |
| `chakra` | Chakra UI v3 | `@chakra-ui/react` v3 and a `ChakraProvider` |
| `mantine` | Mantine v9 | `@mantine/core` v9 and a `MantineProvider` |
| `antd` | Ant Design v6 | `antd` v6, no provider |

Providers are never emitted, and antd's own `Form`/`Form.Item` is never used, since
formstand owns the state. Each backend is typechecked against every supported major's
real declarations before release by the version matrix in `cli/matrix/`. Per-kit binding
notes are on the
[UI kits page](https://scrumrot.github.io/formstand/documentation/cli/ui-kits).

## Beyond the basics

- **[Feature modules](https://scrumrot.github.io/formstand/documentation/cli/layouts#module-layout)**: `--layout module` writes a folder with the schema, pre-wired hooks, one file per field, and one per section, instead of a single file.
- **[Live and form-prop modes](https://scrumrot.github.io/formstand/documentation/cli/layouts)**: `--live` for search and filter panels that have no submit, `--form-prop` when the page owns the form instance.
- **[Config and per-field overrides](https://scrumrot.github.io/formstand/documentation/cli/config)**: project defaults in `formstand.config.ts`, plus a `fields` block that swaps a field's control by path, for a string whose suggestions are data rather than a zod enum.
- **[Custom templates](https://scrumrot.github.io/formstand/documentation/cli/templates)**: `defineTemplate` overrides per-kind field rendering for an in-house design system, inheriting the rest of the scaffold.
- **[Programmatic API](https://scrumrot.github.io/formstand/documentation/cli/programmatic)**: `formstand-cli/codegen` is browser-safe, with no `fs` and no TypeScript compiler, which is how the playground's Schema builder runs the real emitters client-side. The main entry adds `fromType` and `defineConfig`.

## Requirements

- **formstand >= 0.3.0** for the kit backends, **>= 0.7** for `--layout module`, and
  **>= 0.9** for `date` fields. Plain single-file output works on 0.2.0.
- **zod v4** in your project. The CLI walks your schema structurally and does not ship
  zod itself, so the schema module and the generated code both use your copy.

## License

MIT
