# formstand-cli

Generate [formstand](https://scrumrot.github.io/formstand/) form components from a zod schema or a TypeScript type.

```bash
npm install --save-dev formstand-cli
```

## Requirements

- **formstand >= 0.3.0** for `--ui mui`, `--ui shadcn`, `--ui chakra`, `--ui mantine`, and `--ui antd` output (all five kit adapters import the same surface: `UseFieldReturn`, `numberToInputText`, and `parseNumberText`); plain output works on 0.2.0. `--ui chakra` output needs `@chakra-ui/react` **v3** (plus its `@emotion/react` peer) and assumes the host app mounts `ChakraProvider` at the root — the generated file does not emit the provider, same as the mui output assumes the MUI theme setup. `--ui mantine` output needs `@mantine/core` **v9** (plus its `@mantine/hooks` peer) and assumes the host app mounts `MantineProvider` at the root, the same way. `--ui antd` output needs `antd` **v6** — no provider is required (`ConfigProvider` is optional theming); antd 6 peers `react >=18`, so React 19 works without the `@ant-design/v5-patch-for-react-19` patch that antd **5** host apps need. Generated `useFieldArray` hooks get typed items on **formstand >= 0.5** (inferred from the schema through the path); on 0.4 they compile with untyped items.
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
| `--ui plain\|mui[@5\|6\|7\|9]\|shadcn\|chakra\|mantine\|antd` | component flavor (default `plain`). `mui` may pin an `@mui/material` major — `mui@5`, `mui@6`, `mui@7`, `mui@9`; bare `mui` means `mui@9`. Only React-19-capable majors are supported: formstand peers `react: ^19`, so MUI 4 and older can never install alongside it (and MUI skipped major 8 — 7.x jumps to 9). `chakra` targets `@chakra-ui/react` **3** — the only supported major (`chakra@3` spells the same thing; v2 and older lack the v3 compound API and predate the React 19 peer). `mantine` targets `@mantine/core` **9** — the current major (`mantine@9` spells the same thing; majors 6 and older predate the React 19 peer and the v7 styling rewrite, and 7–8 error too: output is verified against v9 only). `antd` targets **antd 6** — the current major (`antd@6` spells the same thing; antd 5 errors too — it runs on React 19 only via the `@ant-design/v5-patch-for-react-19` host patch and the output is verified against v6 only). `plain` and `shadcn` take no version |
| `--layout single\|module` | `single` (default): one file. `module`: a feature-module folder — see below |
| `--sections flat\|panel\|collapsible` | section chrome: `flat` headings (default), bordered `panel`s, or `collapsible` sections (`<details>`; MUI `Accordion`) |
| `--columns 1\|2\|3` | evenly spaced field columns inside each section (default `1`); nested sections span the full row |
| `--max-depth <n>` | schema/type nesting budget before a level degrades to a string + TODO (default: derived from the typed-path budget as `9 + 2 = 11`, so path-budget degradation always wins over walker truncation); also the recursion backstop and the bound on nested-array row extraction |
| `--name <MyForm>` | component name (default derived from the schema/type name) |
| `--out <file>` | write the component here instead of stdout |
| `--schema-out <file>` | type mode: where the generated zod schema goes (default `<schemaName>.ts` next to `--out`) |
| `--live` | live/no-submit form (a map or preview consumes the values as they change): the submit scaffold — `handleSubmit`, the submit button, `useIsSubmitting` — is omitted entirely, the component accepts an optional `onValuesChange?: (values) => void` prop wired through `form.watchValues` (available since formstand 0.2; once on a post-0.12 formstand, `useFormValues(form)` is the render-side one-liner), and the emitted validation mode defaults to `"onChange"` — a live consumer wants validity that tracks the values, not the library-default `"onBlur"` lag. The root element stays a `<form>` for its semantics (label association, the form landmark) with a `preventDefault` `onSubmit` so the browser's implicit Enter-key submission can't navigate the page. Composes with every `--ui`, both layouts, and `--form-prop` |
| `--form-prop` | the page owns the form: the component's props gain `form: Form<typeof schema>` and it stops calling `useForm` itself — the `useForm` scaffold is still emitted, as an exported `use{Name}Form()` hook the page calls, so one instance can feed the generated UI **and** anything else (a map, an autosave effect). With `--layout module` the component takes the prop too, but the module's field hooks stay pre-wired to the exported singleton — pass that instance (e.g. `profileForm` from `./hooks`). Combined with `--live`, the generated component is pure rendering and `onValuesChange` subscribes to the passed form |
| `--config <file>` | config file (default: `formstand.config.{ts,mts,js,mjs}` in the working directory) holding project defaults for `ui`/`layout`/`sections`/`columns`/`live`/`formProp`; explicit flags win |
| `--watch` | regenerate whenever the input file changes (requires `--out`) |
| `--template <file>` | a custom template module (`defineTemplate`) for a UI kit formstand doesn't ship — overrides the per-kind field rendering, inheriting the plain form scaffold; `--layout single` only, overrides `--ui` |
| `--force` | overwrite existing output files |

## What is generated

- `useForm` + typed `initialValues` (strings `""`, booleans `false`, numbers/dates/enums `undefined`, nullable fields `null`, arrays `[]`). A field wrapped in `.default()` / `.prefault()` starts at its default **when the value is a JSON-serializable primitive matching the field kind** — a string, a finite number, a boolean, or a declared enum option. Factory defaults are captured through zod v4's resolving `defaultValue` getter, never invoked by the CLI itself, and only when two reads agree (a non-deterministic factory like `Date.now` would break byte-reproducible output, so it is skipped). Date and object/array defaults have no safe source literal, fields the walker had to degrade to a TODO fallback never seed a default, and all of those keep the blank behavior above.
- One bound control per field: `TextField`, `NumberField`, `CheckboxField`, `SelectField` (enum options from the schema).
- Nested objects as `<fieldset>`/`<legend>` sections.
- Field arrays via `useFieldArray` with stable row keys, add/remove buttons, and a typed empty-item constant.
- `--sections` / `--columns` pick each section's chrome and field grid, in the ui's own dialect: inline styles for `plain`, `Card`/`Accordion` + `sx` grids for `mui`, Tailwind classes (`md:grid-cols-2`, `bg-card`) for `shadcn`, `Card.Root`/`Accordion.Root` + grid style props for `chakra`, `Card`/`Accordion` + `SimpleGrid cols={N}` for `mantine`, `Card`/`Collapse` (items API) + inline-style grids for `antd`. Both flags work with either `--layout`.
- `handleSubmit(console.log)` and a submit button disabled while submitting — unless `--live`, which emits a values-subscription (`onValuesChange` over `form.watchValues`) instead of any submit scaffold and defaults the mode to `"onChange"`. `--form-prop` moves the `useForm` call out of the component into an exported `use{Name}Form()` hook and adds a typed `form` prop.
- `--ui mui`: the same structure over `@mui/material` (any supported major — `mui@5` … `mui@9`, default 9) with an inlined adapter (`muiTextFieldProps` / `useMuiNumberFieldProps` / `muiSelectProps` / `muiSwitchProps`) binding `UseFieldReturn` to MUI props, sharing `parseNumberText` / `numberToInputText` with the library. The number binding is a raw-text-preserving hook (an inline `useNumberText` mirroring formstand's own `useNumberInput`), so typing `85000.50` is never reparsed into `8500050` mid-entry — all four stateful kit backends (mui, chakra, mantine, antd) share this shape. One emitter serves every major through a per-version config; the only prop-surface difference in the emitted output is TextField's slot-props API (`mui@5` emits the legacy `InputProps` / `InputLabelProps`, v6+ emit `slotProps.{input,inputLabel}`). Each supported major is proven to typecheck the generated output — both layouts — by the version matrix (see below).
- `--ui shadcn`: the same structure over your app's [shadcn/ui](https://ui.shadcn.com/) components (imported from the `@/components/ui/*` alias that `npx shadcn add` scaffolds) with an inlined adapter speaking the Radix dialect — `onCheckedChange` / `onValueChange` callbacks, dropdown-close as the blur trigger, and `aria-invalid` error styling with a message line.
- `--ui chakra`: the same structure over [Chakra UI](https://chakra-ui.com/) **v3**'s compound components — `Field.Root` (`invalid`) / `Field.Label` / `Field.ErrorText` for labels and errors, `Input` for text/number/date (native bindings: `inputMode="decimal"`, `type="date"`), `NativeSelect.Root` + `NativeSelect.Field` for enums (a real `<select>`, so the adapter speaks plain DOM change events), and `Switch.Root`/`Switch.HiddenInput`/`Switch.Control`/`Switch.Thumb`/`Switch.Label` for booleans (`checked` + `onCheckedChange` details callback). The generated file assumes your app mounts `ChakraProvider` (`defaultSystem`) at the root and does not emit it. chakra takes no version suffix — v3 is the only supported major (`chakra@3` is accepted as the explicit spelling; `chakra@2` and older fail with an explanation). The output is proven to typecheck against the real v3 declarations — both layouts — by the version matrix (see below).
- `--ui mantine`: the same structure over [Mantine](https://mantine.dev/) **v9** — Mantine field components carry their own `label` + `error` props, so there is no Field wrapper: `TextInput` binds text/number/date natively (`inputMode="decimal"`, `type="date"`; Mantine's `NumberInput` is deliberately not used — its `onChange` takes `(value: number | string)`, not a DOM event), `NativeSelect` binds enums as a real `<select>` with `<option>` children, and `Switch` binds booleans through a plain DOM `checked`/`onChange`. Sections render `Stack`/`Title` (flat), `Card withBorder` + `SimpleGrid` (panel), or `Accordion`/`Accordion.Item`/`Accordion.Control`/`Accordion.Panel` (collapsible); columns use `SimpleGrid cols={N}`. The generated file assumes your app mounts `MantineProvider` at the root and does not emit it. mantine takes no version suffix — v9 (the current major) is the only supported target (`mantine@9` is accepted as the explicit spelling; older majors fail with an explanation — 7 and 8 do accept React 19, but the output is verified against v9 only). The output is proven to typecheck against the real v9 declarations — both layouts — by the version matrix (see below).

- `--ui antd`: the same structure over [Ant Design](https://ant.design/) **v6** — with one hard rule: antd's own `Form`/`Form.Item` (name-based bindings, its own state store) is **never emitted**; formstand owns the form state, so the generated code binds antd's input components as plain controlled components. `Input` binds text/number/date natively (it extends the DOM input props: `inputMode="decimal"`, `type="date"`; antd's `InputNumber` is deliberately not used — its `onChange` is `(value: number | null)`, not a DOM event — and `DatePicker` is dayjs-value-based, so it is not used either). Enums bind antd's `Select` — antd has **no native `<select>`** anywhere, so this is the one value-shaped adapter in the backend: `onChange` receives the selected value directly, `value ?? null` shows the placeholder, and there is no `name` (antd's Select renders no form-posting input). Because there is no `name`, formstand's focus helpers reach the Select through their `[id=path]` fallback on formstand >= 0.11.0 — the generated markup sets `id={path}`, which antd forwards to its real combobox input; on 0.10.x and older, `focusField`/`focusFirstError` simply skip the selects. Booleans bind `Checkbox` (its `onChange` is antd's DOM-ish `CheckboxChangeEvent` with `e.target.checked`, and it has a real `onBlur`) — **not** `Switch`, which has no `onBlur` prop at all and a value-shaped `(checked, event)` callback. With no `Form.Item` there is no built-in error slot, so every non-boolean control paints `status="error"` and renders an explicit `Typography.Text type="danger"` error line under the control, with a plain `<label htmlFor>`/`id` pair for the label. Sections render `Flex`/`Typography.Title` (flat), `Card variant="outlined"` (panel), or `Collapse` via the **items API** (collapsible — children-panels are deprecated in antd 5+). **No provider is required** (`ConfigProvider` is optional theming), and antd 6 peers `react >=18`, so React 19 needs no patch — note that antd **5** on React 19 requires importing `@ant-design/v5-patch-for-react-19` in the host app, which is one reason only v6 is a target. antd takes no version suffix — v6 is the only supported target (`antd@6` is the explicit spelling; older majors fail with an explanation). The output is proven to typecheck against the real v6 declarations — both layouts — by the version matrix (see below).

### The UI-kit version matrix (pre-release check)

`cli/matrix/` is an isolated workspace that installs every supported `@mui/material` major side by side (npm aliases `mui5` … `mui9`) plus `@chakra-ui/react` v3 (alias `chakra3`), `@mantine/core` v9 (alias `mantine9`, with its `@mantine/hooks` peer), and `antd` v6 (alias `antd6`) and typechecks freshly generated `--ui mui@N`, `--ui chakra`, `--ui mantine`, and `--ui antd` output — both layouts, all three section styles in each layout (single-file: flat, panel@2col, collapsible@3col; module: flat, panel@2col, collapsible@2col), under `strict` **plus `exactOptionalPropertyTypes`** (several kits type optional props without `| undefined`), plus literal-attribute probes for the props that hide behind JSX spreads (the TextField slot-props delta; chakra's Input/NativeSelect/Switch surfaces; mantine's TextInput/NativeSelect/Switch surfaces; antd's Input/Select/Checkbox surfaces, including the value-shaped Select onChange restated with its explicit parameter type) — against each package's real type declarations. The install-staleness gate derives from the job list itself, so adding a kit without installing its alias fails loudly instead of silently typechecking against the repo root's copy:

```bash
cd cli/matrix && npm install   # once; a chunky install, isolated from the root/cli installs
cd .. && npm run matrix        # generates + typechecks against mui@5, 6, 7, 9, chakra@3, mantine@9, and antd@6
```

Run it before releasing any change to the MUI, chakra, mantine, or antd backends or the version configs. It is deliberately not part of the default `npm test` (it needs the matrix `node_modules`).

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

`--out` names the folder (created if missing; every destination is checked before anything is written). Without `--out`, all files stream to stdout with `// --- file:` headers. Array sections bind their row fields inline with template paths; `date` fields get real `DateField` / date-input bindings (formstand ≥ 0.9). Works with **all six uis** — `plain` modules bind straight through formstand's prop builders, while the five kit uis get a shared adapter file exporting the generic builders/hooks instead of inlining them per file: `adapter.ts` for `mui`/`chakra`/`mantine` (pure prop builders + the number hook), `adapter.tsx` for `shadcn`/`antd` (their `FieldError` components render JSX). Requires **formstand ≥ 0.7** (`createFormHooks`).

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
  live: false, // --live default: no-submit forms with onValuesChange
  formProp: false, // --form-prop default: the page owns the form
});
```

`defineConfig` is an identity function with types — completion and typo-checking in the config file. `ui` accepts the same spellings as `--ui`, including the versioned `"mui@5"` … `"mui@9"`, `"chakra"` (or its explicit spelling `"chakra@3"`), `"mantine"` (or `"mantine@9"`), and `"antd"` (or `"antd@6"`). Pair it with `--watch` for schema-first development: edit the schema, the module regenerates.

## Custom templates

For a UI kit formstand doesn't ship built in — an in-house design system, say — a **template** overrides the per-kind field rendering while inheriting the generated form's scaffold (sections, arrays, discriminated unions, submit). A UI kit differs in its field components, not the form skeleton. (The sketch below targets Mantine for familiarity; Mantine now ships built in as `--ui mantine`, so treat it as an illustration of the template surface, not a recommendation over the built-in backend.)

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
- `description` — the field's captured `.describe()`/JSDoc description as a `string | undefined` expression (a prop reference or a quoted literal); `""` when the schema carries none — gate your markup on it.

Unlisted kinds fall back to the plain output, so a template can override only the kinds its kit changes. `--template` overrides `--ui` and currently supports `--layout single` (module support is planned). Set a project default with `template: "./mantine.template.ts"` in `formstand.config.ts`.

## Supported schema surface

`string`, `number`/`int`, `boolean`, `date`, `enum`, unions of string literals, `object`, `array`, `tuple`, with `.optional()` / `.nullable()` / `.default()` / `.pipe()` unwrapped.

**Descriptions → helper text**: a field's zod `.describe("1,000 lbs")` / `.meta({ description })` (one registry store in zod v4 — the last call wins; across wrappers the outermost entry present wins, so both `z.number().describe(...).optional()` and `z.number().optional().describe(...)` capture) — or, in type mode, the member's leading JSDoc description (re-emitted into the generated schema as `.describe()`) — becomes the control's helper text in both layouts, union variant fields and tuple elements included. Per-kit slot: mui `helperText={fieldError(field) ?? description}` (the error keeps the one slot while present), shadcn a muted `<p>` and antd a `Typography.Text type="secondary"` line (each rendered only when no error), chakra `Field.HelperText` under the same guard, mantine the native `description` prop (its own slot — coexists with `error`), plain an always-visible `<p className="zf-help">` (formstand's built-in components own the error line internally). Booleans render it on shadcn/mantine/plain and are skipped where the control has no slot (mui `FormControlLabel`/`Switch`, chakra `Switch.Root`, antd's bare `Checkbox`). Custom templates get it as `ctx.description` (an expression like `ctx.label`; `""` when absent). `.meta` adornments (unit prefix/suffix elements) are not generated — the kits' adornment APIs are mutually incompatible; helper text covers the units case. Anything else falls back to a string field with a `// TODO:` comment so the file still compiles. `date` fields emit a real `DateField` (plain) or date-input binding (mui / shadcn) — no TODO (requires formstand ≥ 0.9). `tuple` fields (`z.tuple([...])` / `[A, B]`) render fixed positional controls bound at static numeric-index paths (`coord.0`, `coord.1`) in both layouts; a non-scalar tuple element degrades to a TODO. Arrays nested inside array rows extract a `useFieldArray`-owning row component at **every** level, recursively (bounded by `--max-depth`), threading each enclosing row's index as a `p0`, `p1`, … prop — so `teams[] › members[] › phones[]` all generate, in **both** layouts. In `--layout module` each level is a `{Stem}Row`/`{Stem}Rows` pair in the section file; in the single-file layout it's a child `{Stem}Rows` component (taking a typed `form` prop) above the main component. A non-array shape inside a row (a nested object, union, or tuple) stays a TODO.

Known limitations:

- **Dots in keys**: formstand paths split on `.`, so a field named `"a.b"` is not path-addressable. The key is kept in the zod schema and `initialValues`, but no control is bound — a `{/* TODO: field "a.b" skipped ... */}` comment marks the spot and the CLI prints a warning.
- **Paths deeper than formstand's typed budget**: `FieldPath` stops at **9 segments** by default — the CLI's budget matches the library default (an array level spends two segments: name + row index) — so a binding whose full path would exceed that degrades to a `{/* TODO: path ... exceeds formstand's typed FieldPath depth (9); bind by hand */}` comment plus a CLI warning. The subtree is still materialized in the zod schema and `initialValues`; paths exactly at the limit bind normally. The two budgets interlock: the WALKER's default nesting budget is derived as path budget + 2 (= 11), one level past the path budget — so at default flags a leaf of up to 10 segments (one past the path budget) is walked truly and degrades through the path budget (a real, correctly typed subtree with a depth TODO). A leaf **deeper than that** (11+ segments at default flags, or past an explicit `--max-depth`) is truncated by the walker instead: it degrades to a string-kind placeholder whose kind/flags may no longer match the schema. The file still compiles — a truncated leaf forces the `as unknown as` cast on `initialValues` — and the CLI prints a per-path walker-truncation warning (`raise --max-depth or bind by hand`). The library can widen a form's budget via `createForm`'s type-level `pathDepth` option; a future `--path-depth` flag would pair with it so generated bindings follow a widened form (not implemented yet — bind those paths by hand for now).
- **Tuple elements** that aren't scalar (an object/array/union/nested tuple at a tuple position), and a tuple's **variadic rest** (`z.tuple([...], rest)`), degrade to a `// TODO` at that position — the fixed scalar positions still generate. **Methods and callable types** are skipped / degraded to a string field the same way.

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
