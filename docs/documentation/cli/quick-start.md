# Quick start

```bash
npm install -D formstand-cli
npx formstand-gen --help
```

The package installs a binary named `formstand-gen`. Your project supplies zod v4 and formstand itself; the CLI ships neither, and nothing it generates imports from the CLI.

## From a zod schema

Point it at a file that exports a schema. The schema is loaded and introspected at runtime using **your** copy of zod, so the output reflects exactly what the schema says, including optionality, nullability, defaults, and enum options.

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

you get a component with a `TextField` per string, a `NumberField` for `age`, a `SelectField` carrying the enum's options, a `useFieldArray` section for `tags` with add and remove buttons, typed `initialValues` (note `age: null`, since nullability flows through to match [`emptyValue`](../components#empty-values-null-vs-undefined) semantics), and a wired `handleSubmit`.

Which export gets used: `--export NAME` if you pass it, otherwise the default export, otherwise the sole zod-schema export in the file.

## From a TypeScript type

No schema yet? Give it a type or interface and it generates **both** the zod schema and the form. You would need the schema anyway, since it is the runtime source of truth.

```bash
npx formstand-gen src/types.ts --type Profile --out src/ProfileForm.tsx --schema-out src/profileSchema.ts
```

The type is expanded through the TypeScript compiler. Primitives, `Date`, string-literal unions (rendered as selects), arrays, nested objects, `?`-optional and `| null` properties all map cleanly. A member's leading JSDoc description is carried into the generated schema as `.describe()`, which then becomes the control's helper text.

## Where the output goes

| You pass | What happens |
| --- | --- |
| nothing | the component streams to stdout, so you can pipe it anywhere |
| `--out FILE` | written there, parent directories created as needed |
| `--out DIR` with `--layout module` | a feature folder, see [Layouts](./layouts#module-layout) |
| `--schema-out FILE` (type mode) | the generated zod schema goes here, defaulting to `<schemaName>.ts` next to `--out` |

Notes and warnings go to stderr, so redirecting stdout stays clean. Writes are all-or-nothing: if any destination already exists and `--force` isn't set, nothing is written at all.

## Iterating on a schema

```bash
npx formstand-gen src/profileSchema.ts --watch --out src/ProfileForm.tsx
```

`--watch` regenerates whenever the input file changes. Paired with a [config file](./config) holding your project defaults, editing the schema rewrites the form as you go, which is the schema-first loop the tool was built for.

::: warning Version floors
Kit output (`--ui mui`, `shadcn`, `chakra`, `mantine`, `antd`) imports `parseNumberText` and `numberToInputText`, so it needs formstand 0.3.0 or newer. `--layout module` needs 0.7 for `createFormHooks`. `z.date()` fields need 0.9. Plain single-file output works on 0.2.0.
:::

## Try it without installing anything

The playground runs the real emitters in your browser:

- [Schema builder](https://scrumrot.github.io/formstand/examples/#/schema-builder): build a schema by hand or paste TypeScript, then watch the generated files update as you flip `--ui`, `--layout`, `--sections`, `--columns`, `--live`, and `--form-prop`.
- [CLI command builder](https://scrumrot.github.io/formstand/examples/#/cli-command): pick your options and copy the exact `formstand-gen` command.
