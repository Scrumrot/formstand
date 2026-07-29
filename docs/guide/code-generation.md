# Code generation

`formstand-cli` scaffolds a complete, compiling form component from something you already have — a zod schema or a TypeScript type. It's a one-shot generator: the output file is yours to edit, with no markers or regeneration magic. This page covers both input modes, the output styles, and exactly what's supported.

```bash
npm install -D formstand-cli     # the binary is named formstand-gen
npx formstand-gen --help
```

## From a zod schema

Point it at a file that exports a schema. The schema is loaded and introspected at runtime — using **your** copy of zod — so what you get reflects exactly what the schema says, including optionality, nullability, and enum options.

```bash
npx formstand-gen src/contactSchema.ts --out src/ContactForm.tsx
```

Given:

```ts
export const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().nullable(),
  role: z.enum(["admin", "user"]),
  tags: z.array(z.object({ label: z.string() })),
});
```

you get a component with a `TextField` per string, a `NumberField` for `age`, a `SelectField` with the enum's options, a `useFieldArray` section for `tags` with add/remove buttons, typed `initialValues` (note `age: null` — nullability flows through, matching [`emptyValue`](./components#empty-values-null-vs-undefined) semantics), and a wired `handleSubmit`.

With multiple schema exports, pick one with `--export`; a default export works too.

## From a TypeScript type

No schema yet? Give it a type or interface, and it generates **both** the zod schema and the form — you'd need the schema anyway, since it's the runtime source of truth.

```bash
npx formstand-gen src/types.ts --type Profile --out src/ProfileForm.tsx --schema-out src/profileSchema.ts
```

The type is expanded through the TypeScript compiler: primitives, `Date`, string-literal unions (rendered as selects), arrays, nested objects, `?`-optional and `| null` properties all map cleanly.

## Output styles

`--ui plain` (the default) emits formstand's [bound components](./components). The kit backends emit the same structure against a real component library, with a small adapter inlined (single-file) or shared (`adapter.ts` in module layout) so the output is self-contained:

- `--ui mui` — Material UI, any React-19-capable major: `mui@5`, `mui@6`, `mui@7`, `mui@9` (bare `mui` means 9; MUI skipped major 8). The same pattern as the [MUI playground demos](./examples#material-ui).
- `--ui shadcn` — [shadcn/ui](https://ui.shadcn.com/) conventions: imports from your app's `@/components/ui/*` alias, `aria-invalid` error styling, value-first callbacks for the Radix widgets — the pattern of the [shadcn playground demos](./examples#shadcn-ui).
- `--ui chakra` — [Chakra UI](https://chakra-ui.com/) **v3**'s compound components: `Field.Root`/`Field.Label`/`Field.ErrorText`, native `Input` and `NativeSelect` bindings, compound `Switch`. Your app mounts `ChakraProvider`; the output doesn't emit it.
- `--ui mantine` — [Mantine](https://mantine.dev/) **v9**: `TextInput`/`NativeSelect`/`Switch` carry their own `label` and `error` props, so leaves are one-liners. Your app mounts `MantineProvider`.
- `--ui antd` — [Ant Design](https://ant.design/) **v6**, bound as plain controlled components — antd's own `Form`/`Form.Item` (a second form state store) is never emitted; formstand owns the state. No provider required.

Every kit backend covers both layouts, the full field-kind surface, and every `--sections`/`--columns` variant. Each target is proven against its kit's real type declarations by the CLI's **version matrix** (`cli/matrix/` installs all supported majors side by side — `mui@5`…`mui@9`, chakra 3, mantine 9, antd 6 — and typechecks freshly generated output against each; see the [CLI README](https://github.com/Scrumrot/formstand/tree/main/cli#the-ui-kit-version-matrix-pre-release-check)). To compare backends live, the playground's Generated group renders the same Onboarding schema through [mui](https://scrumrot.github.io/formstand/examples/#/gen-mui), [chakra](https://scrumrot.github.io/formstand/examples/#/gen-chakra), [mantine](https://scrumrot.github.io/formstand/examples/#/gen-mantine), and [antd](https://scrumrot.github.io/formstand/examples/#/gen-antd) — only `--ui` varies.

::: warning Requirements
Kit output imports `parseNumberText`/`numberToInputText`, which need **formstand ≥ 0.3.0**. Your project supplies `zod` v4 plus the kit itself: `@mui/material` for mui, the scaffolded components (`npx shadcn add button input label checkbox select`) for shadcn, `@chakra-ui/react` v3 (plus its `@emotion/react` peer) for chakra, `@mantine/core` v9 (plus `@mantine/hooks` and the `@mantine/core/styles.css` import) for mantine, `antd` v6 for antd. The CLI has no runtime footprint in your app.
:::

## Flags

| Flag | Meaning |
| --- | --- |
| `--export NAME` | which schema export to use (zod mode); `default` works |
| `--type NAME` | expand this type/interface instead (type mode) |
| `--ui plain\|mui[@5\|6\|7\|9]\|shadcn\|chakra\|mantine\|antd` | output style, default `plain`; `mui` may pin an `@mui/material` major (bare `mui` = `mui@9`); `chakra`/`mantine`/`antd` target v3/v9/v6 (the explicit `chakra@3`/`mantine@9`/`antd@6` spellings work; unsupported majors fail with an explanation) |
| `--layout single\|module` | `single` (default): one file. `module`: a feature-module folder (`schema.ts`/`types.ts`/`hooks.ts` via [`createFormHooks`](./state#pre-wired-hooks-createformhooks), one file per field, one per section with path-scoped flags) — `--out` names the folder; works with every ui (kit modules get a shared `adapter.ts(x)`); requires formstand ≥ 0.7 |
| `--sections flat\|panel\|collapsible` | section chrome: `flat` headings (default), bordered `panel`s, or `collapsible` sections (`<details>`; MUI `Accordion`) |
| `--columns 1\|2\|3` | evenly spaced field columns inside each section (default `1`); nested sections span the full row |
| `--config <file>` | config file (default `formstand.config.{ts,mts,js,mjs}` in the working directory) with project defaults for `ui`/`layout`/`sections`/`columns` via `defineConfig` — flags win |
| `--watch` | regenerate whenever the input changes (requires `--out`) |
| `--template <file>` | a custom template module (`defineTemplate`) for a UI kit formstand doesn't ship — overrides the per-kind field rendering, inheriting the plain form scaffold. `--layout single` only; overrides `--ui` |
| `--name MyForm` | component name, default derived from the input |
| `--out FILE` | write the component here instead of stdout (parent dirs created) |
| `--schema-out FILE` | type mode: where the generated zod schema goes |
| `--force` | allow overwriting existing files |

Without `--out`, the code streams to stdout (pipe it wherever); notes and warnings go to stderr, so redirection stays clean. Writes are all-or-nothing: if any destination exists and `--force` isn't set, nothing is written.

## What's supported, and what degrades

The generator never emits silently broken code. Anything outside the supported subset degrades **loudly**:

- **Unsupported zod kinds** (unions of objects, records, maps…) and **unsupported type shapes** (generics, callable types) become a text field with a `// TODO` comment naming what was skipped.
- **Tuples** (`z.tuple([...])` / `[A, B]`) generate fixed positional controls at static numeric-index paths (`coord.0`, `coord.1`); a non-scalar element or a variadic rest degrades to a TODO at that position.
- **Recursive schemas** (zod's getter idiom) are cut off with a TODO, not a stack overflow: the walkers carry a seen-set (a self-referential schema is caught directly) plus a depth budget (`--max-depth`, default 10) as the backstop for getters that mint a fresh schema each access. So the IR is always finite.
- **Field names containing `.`** aren't path-addressable in formstand — the field is kept in the schema and `initialValues` but its binding is replaced by a TODO comment, with a warning on stderr.
- **Hostile names** (quotes, backticks, braces) are escaped per context; generated output is typechecked against the real library in the CLI's own CI.
- **Arrays nested inside array rows** extract a real `useFieldArray`-owning row component at every level, recursively, in **both** layouts (bounded by `--max-depth`) — each enclosing row's index threads down as a `p0`, `p1`, … prop. Single-file emits a child `{Stem}Rows` component (with a typed `form` prop) above the main component; module emits a `Row`/`Rows` pair per level. A non-array shape inside a row (nested object/union/tuple) stays a TODO.

**`Date` fields** are fully supported (formstand ≥ 0.9): plain output emits `<DateField>`, and every kit adapter (mui, shadcn, chakra, mantine, antd) binds a native date input through `dateToInputText` / `parseDateText`.

## Programmatic API

Everything the binary does is importable, over two entry points.

`formstand-cli/codegen` is the **browser-safe** surface: every step downstream of the IR — `fromZod`, the emitters, `emitZodSchema`, `defineTemplate`, `labelFromName` — is a pure string builder with no `fs`/`path` and no TypeScript compiler, so it bundles for the browser. The [Schema builder](https://scrumrot.github.io/formstand/examples/#/schema-builder) generates forms client-side through exactly this subpath:

```ts
import { fromZod, emitPlainForm } from "formstand-cli/codegen";

const code = emitPlainForm({
  ir: fromZod(profileSchema),
  formName: "ProfileForm",
  schemaImport: { name: "profileSchema", from: "./profileSchema", kind: "named" },
});
```

The main `formstand-cli` entry re-exports all of that and adds the parts that need Node — `fromType` (parse a TypeScript type/interface via the compiler) and `defineConfig`. Import from `formstand-cli/codegen` for a browser build; the main entry pulls the TypeScript compiler and won't bundle for the browser.
