# Code generation

`formstand-cli` scaffolds a complete, compiling form component from something you already have — a zod schema or a TypeScript type. It's a one-shot generator: the output file is yours to edit, with no markers or regeneration magic. This page covers both input modes, the two output styles, and exactly what's supported.

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

`--ui plain` (the default) emits formstand's [bound components](./components). `--ui mui` emits the same structure against Material UI 9, with a small adapter inlined so the file is self-contained — the same pattern as the [MUI playground demos](./examples#material-ui). `--ui shadcn` emits against [shadcn/ui](https://ui.shadcn.com/) conventions — imports from your app's `@/components/ui/*` alias, `aria-invalid` error styling, value-first callbacks for the Radix widgets — the pattern of the [shadcn playground demos](./examples#shadcn-ui).

::: warning Requirements
`--ui mui` and `--ui shadcn` output imports `parseNumberText`/`numberToInputText`, which need **formstand ≥ 0.3.0**. Your project supplies `zod` v4 plus the UI kit — `@mui/material` for MUI output; the scaffolded components (`npx shadcn add button input label checkbox select`) for shadcn output. The CLI has no runtime footprint in your app.
:::

## Flags

| Flag | Meaning |
| --- | --- |
| `--export NAME` | which schema export to use (zod mode); `default` works |
| `--type NAME` | expand this type/interface instead (type mode) |
| `--ui plain\|mui\|shadcn` | output style, default `plain` |
| `--layout single\|module` | `single` (default): one file. `module`: a feature-module folder (`schema.ts`/`types.ts`/`hooks.ts` via [`createFormHooks`](./state#pre-wired-hooks-createformhooks), one file per field, one per section with path-scoped flags) — `--out` names the folder; works with all three uis (kit modules get a shared `adapter.ts(x)`); requires formstand ≥ 0.7 |
| `--name MyForm` | component name, default derived from the input |
| `--out FILE` | write the component here instead of stdout (parent dirs created) |
| `--schema-out FILE` | type mode: where the generated zod schema goes |
| `--force` | allow overwriting existing files |

Without `--out`, the code streams to stdout (pipe it wherever); notes and warnings go to stderr, so redirection stays clean. Writes are all-or-nothing: if any destination exists and `--force` isn't set, nothing is written.

## What's supported, and what degrades

The generator never emits silently broken code. Anything outside the supported subset degrades **loudly**:

- **Unsupported zod kinds** (unions of objects, records, maps, tuples…) and **unsupported type shapes** (generics, tuples, callable types) become a text field with a `// TODO` comment naming what was skipped.
- **Recursive schemas** (zod's getter idiom) are cut off at a depth limit with a TODO, not a stack overflow.
- **Field names containing `.`** aren't path-addressable in formstand — the field is kept in the schema and `initialValues` but its binding is replaced by a TODO comment, with a warning on stderr.
- **Hostile names** (quotes, backticks, braces) are escaped per context; generated output is typechecked against the real library in the CLI's own CI.
- **`Date` fields** bind as text inputs with a TODO — pair with the date picker of your choice.

## Programmatic API

Everything the binary does is importable — `fromZod`, `fromType`, and the emitters — if you want to build your own tooling on the same IR:

```ts
import { fromZod, emitPlainForm } from "formstand-cli";
```
