# Command reference

```
formstand-gen <input file> [flags]
```

## Flags

| Flag | Meaning |
| --- | --- |
| `--export NAME` | which export holds the zod schema (zod mode); `default` works. Falls back to the default export, then the sole schema export |
| `--type NAME` | expand this TypeScript type or interface instead, generating the schema too |
| `--schema NAME\|#/pointer` | `.json` input: which schema to generate from, as a component schema name or a full `#/...` JSON pointer. Required when an OpenAPI document declares several component schemas. See [JSON Schema and OpenAPI inputs](#json-schema-and-openapi-inputs) |
| `--ui plain\|mui[@5\|6\|7\|9]\|shadcn\|chakra\|mantine\|antd` | output style, default `plain`. See [UI kits](./ui-kits) |
| `--layout single\|module` | one file (default) or a feature-module folder. See [Layouts](./layouts#module-layout) |
| `--sections flat\|panel\|collapsible` | section chrome, default `flat` |
| `--columns 1\|2\|3` | field columns inside each section, default `1`. Nested sections span the full row |
| `--live` | no submit scaffold; adds an `onValuesChange` prop and defaults the mode to `"onChange"`. See [`--live`](./layouts#live-forms-with-no-submit) |
| `--form-prop` | the page owns the form: adds a `form` prop and exports a `use{Name}Form()` hook. Single-file only; the module layout's form is a singleton the page imports. See [`--form-prop`](./layouts#form-prop-the-page-owns-the-form) |
| `--name MyForm` | component name, default derived from the schema or type name |
| `--out FILE` | write here instead of stdout; names the folder under `--layout module`. Parent directories are created |
| `--schema-out FILE` | type and `.json` modes: where the generated zod schema goes, default `<schemaName>.ts` next to `--out` |
| `--max-depth N` | nesting budget before a level degrades to a string plus a TODO. Default is derived from the typed-path budget as `path budget + 2` (`11` at default flags), so path-budget degradation always wins over walker truncation. Also the recursion backstop and the bound on nested-array row extraction |
| `--path-depth N` | the typed-path budget in segments, `1` to `25` (default `9`, formstand's own). Bindings past it degrade to a TODO. Any other value is emitted as `pathDepth: N` into the form's options, so the library's `FieldPath` union widens or narrows to exactly the boundary the generator drew. See [The two depth budgets](#the-two-depth-budgets) |
| `--config FILE` | config file, default `formstand.config.{ts,mts,js,mjs}` in the working directory. See [Config](./config) |
| `--template FILE` | a custom template module for a kit formstand doesn't ship. `--layout single` only, and it overrides `--ui`. See [Templates](./templates) |
| `--watch` | regenerate whenever the input changes; requires `--out` |
| `--force` | allow overwriting existing files |
| `--wizard` | ask the flag questions interactively, one at a time. Runs alone; see below |
| `--help`, `-h` | usage |

Without `--out`, code goes to stdout while notes and warnings go to stderr, so redirection stays clean. Writes are all-or-nothing: if any destination exists and `--force` isn't set, nothing is written.

## The wizard

`formstand-gen --wizard` walks through the questions the flags answer, one at a time: which file, zod export or TS type (a `.json` input skips that question and asks `--schema` instead), which kit, which layout, section chrome, columns, name, and where to write. Enter accepts the default shown on every question, invalid answers re-ask instead of exiting, an existing output target offers `--force` on the spot, and the interview ends by printing the composed `formstand-gen` command before asking to run it, so the run is reproducible without the wizard from then on.

Three properties worth relying on. It is strictly opt-in: nothing prompts from a bare `formstand-gen` or a TTY check, so scripts and CI keep their contract. It takes the flag alone: a half-flags, half-questions run would have two sources of truth, so any other flag beside `--wizard` is an error. And every prompt writes to stderr, so a run that ends streaming the component to stdout stays cleanly pipeable; the answers can even be piped in on stdin, one per line.

## What gets generated

- **`useForm` and typed `initialValues`.** Strings start `""`, booleans `false`, numbers, dates, and enums `undefined`, nullable fields `null`, arrays `[]`.
- **Defaults are honored** when they are safe. A field wrapped in `.default()` or `.prefault()` starts at its default if the value is a JSON-serializable primitive matching the field kind: a string, a finite number, a boolean, or a declared enum option. Factory defaults are read through zod v4's resolving `defaultValue` getter, never invoked by the CLI, and only used when two reads agree, since a non-deterministic factory such as `Date.now` would break byte-reproducible output. Date, object, and array defaults have no safe source literal, and degraded fields never seed one; all of those fall back to the blank values above.
- **One bound control per field**, picked from the field's kind.
- **Nested objects** as sections, framed by `--sections`.
- **Arrays** via `useFieldArray`, with stable row keys, add and remove buttons, and a typed empty-item constant.
- **Discriminated unions** as a discriminant select plus one conditional block per variant, bound through `useVariantField`. A required union starts as its first variant; an optional or nullable union starts **empty** and its select is clearable: the empty choice writes the whole union back to `undefined`/`null`, and picking a tag starts that variant blank. The one exception is shadcn, whose Radix select cannot hold an empty item, so there the union starts empty but cannot be re-cleared from the select. A union that is an **array's row item** generates a `{Stem}Row` component per row, bound on the row-indexed path (formstand 0.16 and newer).
- **Descriptions as helper text**, from `.describe()`, `.meta({ description })`, or JSDoc in type mode. See [Descriptions](./config#descriptions-become-helper-text).
- **A submit handler and a button** disabled while submitting, unless `--live` replaces the whole scaffold with a values subscription.

## Supported schema surface

`string`, `number` and `int`, `boolean`, `date`, `enum`, unions of string literals, `object`, `array`, and `tuple`, with `.optional()`, `.nullable()`, `.default()`, and `.pipe()` unwrapped.

Bounds ride along too: `.min()` / `.max()` / `.length()` on strings and arrays, `.min()` / `.max()` / `.gt()` / `.lt()` and `.int()` (or `z.int()`) on numbers. They change no control, but the zod schema emitted for type and JSON Schema inputs carries them (`z.string().min(3).max(9)`, `z.number().int().gt(0)`, `z.array(...).min(1)`), and the generated tests derive bound cases from them. When a bound repeats, the tightest wins. TypeScript types carry no bounds, so type mode never captures any.

Tuples (`z.tuple([...])`, or `[A, B]` in type mode) render fixed positional controls at static numeric-index paths such as `coord.0` and `coord.1`, in both layouts.

Arrays nested inside array rows extract a `useFieldArray`-owning row component at **every** level, recursively, in both layouts, bounded by `--max-depth`. Each enclosing row's index threads down as a `p0`, `p1`, and so on prop, so `teams[] › members[] › phones[]` all generate. Single-file emits a child `{Stem}Rows` component with a typed `form` prop above the main component; module layout emits a `Row` and `Rows` pair per level in the section file.

`date` fields are fully supported on formstand 0.9 and newer: plain output emits `<DateField>`, and every kit adapter binds a native date input through `dateToInputText` and `parseDateText`.

## JSON Schema and OpenAPI inputs

A `.json` input file switches the front-end: the document is read as a bare JSON Schema (the 2020-12 dialect) or an OpenAPI 3.x document, and the same pipeline runs on the result. The input carries no runtime validator, so the CLI emits a zod schema beside the component exactly as type mode does, with `--schema-out` placing it and `--layout module` making it the module's `schema.ts`.

**Selecting a schema.** A bare `--schema Name` is looked up under `#/components/schemas`, then `$defs`, then `definitions`. A full `#/...` JSON pointer reaches anything else, such as an operation's request body: `#/paths/~1orders/post/requestBody/content/application~1json/schema` (per JSON pointer rules, `~1` escapes a `/` inside a segment). An OpenAPI document with exactly one component schema needs no flag at all; with several, the error lists what is available. A bare JSON Schema file is itself the schema, so `--schema` is only needed to pick something else out of it.

**What translates.**

| Keyword | Generated |
| --- | --- |
| `type: "string"` | text field; `format: date` or `date-time` becomes a date field; `format: email`, `uri`, or `uuid` stays a text field but emits `z.email()` / `z.url()` / `z.uuid()` in the generated schema |
| `enum` of strings, `const`, `oneOf` of string consts | select carrying the options |
| `type: "number"` or `"integer"` | number field; `integer` emits `.int()` in the generated schema |
| `minLength` / `maxLength`, `minimum` / `maximum` / `exclusiveMinimum` / `exclusiveMaximum` (2020-12 numeric form), `minItems` / `maxItems` | no control change; the generated schema carries the bound (`.min()` / `.max()`, `.gte()` / `.lte()` / `.gt()` / `.lt()`) and the generated tests derive cases from it. A non-numeric bound is ignored; when both the inclusive and exclusive spellings exist, the tighter wins |
| `type: "object"` with `properties` | a section; `required` sets which fields are optional |
| `type: "array"` with `items` | a `useFieldArray` row section |
| `prefixItems` | a tuple with fixed positional controls |
| `oneOf` with an OpenAPI `discriminator` | a discriminated union bound through `useVariantField` |
| `allOf` of object schemas | one merged section (properties merge, `required` lists union) |
| `type: ["X", "null"]`, `nullable: true`, or `oneOf` with a null branch | a nullable field, whichever dialect spells it |
| `default` (JSON primitives) | seeds `initialValues` **and** emits `.default(value)` in the generated schema, so a server-side parse of an omitted field defaults the way the document said (note zod's `.default()` makes the input optional) |
| `description` / `title` | helper text / the field's label |

`$ref` resolves within the document, including through `allOf` and `oneOf` branches. Both nullable dialects are honored wherever they appear, so 3.0 documents work without a dialect flag.

**What degrades.** The same loud TODO fallback as everywhere else, mirrored on stderr: external `$ref`s, recursive `$ref`s, objects with only `additionalProperties` or `patternProperties` (records have no fixed fields to bind), draft-07 tuples spelled as an `items` array (use `prefixItems`), multi-type arrays like `["string", "number"]`, `allOf` with non-object branches, and `oneOf`/`anyOf` without a discriminator or string consts. Non-primitive `default`s start blank with a warning. Swagger 2.0 documents are refused with a conversion hint, and YAML input is refused too: convert it to JSON first (`npx js-yaml api.yaml > api.json`).

## Generated tests: `--tests`

`--tests vitest` (or `jest`, the same component spec with different globals; or `playwright`; combinable as a comma list) emits a spec **beside the component**, derived from the same schema walk, so the spec and the form cannot drift. The component spec proves the validation and submit paths in two layers: store-level cases ride [`formstand/testing`](../testing) (a blank submit reports every field a blank form cannot satisfy, including an array whose row minimum `[]` cannot meet; a valid fill round-trips `schema.parse`; each string format rejects and accepts its samples; each bounded string or number rejects a value just past its tightest edge and accepts one inside it), and a couple of render cases prove the DOM wiring by **label** through the `aria-invalid` contract. The Playwright spec drives the same flows by role and label, and is emitted only when the config supplies a base URL.

```ts
// formstand.config.ts
export default defineConfig({
  tests: {
    runners: ["vitest"],                     // the --tests default
    renderWrapper: "./test/renderWithProviders", // exports RenderWrapper
    playwright: { baseURL: "http://localhost:5173", route: "/order" },
  },
});
```

The honest edges, by design (see `cli/design/generated-tests.md`): assertions are presence-shaped, never zod's default prose; kit output without a configured `renderWrapper` emits its render cases as `it.skip` with a stderr warning (the generator never emits providers); `--live` and `--form-prop` output skips the render/browser layers with the reason in a comment; an async schema (a zod-mode async refine) emits its submit cases fully written but `it.skip`, naming the IO to stub; and bound cases cover one edge per field (the minimum first, then the maximum, then integrality) with samples the generator can construct, so a bounded email gets its format case only. The spec regenerates **with** the component (the two are one unit), and fills go by label, so a hand-renamed label fails the spec on purpose. Specs need `--out`, and their store-level cases import `formstand/testing` (formstand 0.20+).

## How unsupported shapes degrade

The generator never emits silently broken code. Anything outside the supported subset degrades loudly, and the file still compiles.

- **Unsupported zod kinds** (unions of objects, records, maps) and **unsupported type shapes** (generics, callable types, methods) become a text field with a `// TODO` comment naming what was skipped.
- **Non-scalar tuple elements** and a tuple's **variadic rest** (`z.tuple([...], rest)`) degrade to a TODO at that position. The fixed scalar positions still generate.
- **Containers inside array rows generate** (formstand 0.17 types them): a discriminated union as the row item or as a field inside a row object, a tuple row item or row field (positions bind at static sub-indices), an array-of-arrays item, and the same shapes under nested arrays at any depth. The single-file layout extracts a child component per site that needs hooks; the module layout binds in the Row component. A **container inside a union variant** binds too (formstand 0.20): an object or tuple nested in one branch flattens to its scalar leaves, each bound as a dotted variant sub-path (`useVariantField(form, path, "billing.zip")`). What still degrades to a TODO is an **array or union inside a variant** — their bindings need hooks and row machinery of their own on variant paths.
- **Recursive schemas** written with zod's getter idiom are cut off with a TODO rather than a stack overflow. The walkers carry a seen-set, which catches a directly self-referential schema, plus the `--max-depth` budget as the backstop for getters that mint a fresh schema on each access. The IR is always finite.
- **Field names containing `.`** are not path-addressable in formstand, since paths split on dots. The key stays in the schema and in `initialValues`, but its binding is replaced by a TODO comment and the CLI warns on stderr.
- **Hostile names** (quotes, backticks, braces) are escaped per context. Generated output is typechecked against the real library in the CLI's own CI.

### The two depth budgets

`FieldPath` stops at **9 segments** by default, and an array level spends two of them (name plus row index). A binding whose full path would exceed that degrades to a TODO comment plus a warning, while the subtree is still materialized in the schema and `initialValues`. Paths exactly at the limit bind normally.

The walker's own budget is derived as the path budget plus 2, so at default flags a leaf of up to 10 segments is walked truthfully and degrades through the *path* budget, giving you a real, correctly typed subtree with a depth TODO on the binding. A leaf deeper than that, meaning 11 or more segments at default flags or past an explicit `--max-depth`, is truncated by the *walker* instead: it becomes a string-kind placeholder whose kind and flags may no longer match the schema, `initialValues` picks up an `as unknown as` cast, and the CLI prints a per-path truncation warning telling you to raise `--max-depth` or bind by hand.

`--path-depth N` moves the path budget. Every boundary the generator draws moves with it, in both layouts: which leaves bind and which degrade, the stderr warnings, the override validator, and the generated tests. The emitted form carries the same number as `createForm`'s type-level [`pathDepth`](../typed-paths#how-path-segments-are-interpreted) option (`useForm(schema, { ..., pathDepth: 12 })`, or `pathDepth: 12` in the module layout's `hooks.ts`), and every typed `form` prop (`Form<typeof schema, 12>` on child row components and under `--form-prop`) and the generated spec's own `createForm` say it too, so the library's union and the generator agree. The walker budget follows: without `--max-depth` it derives as `N + 2`, so `--path-depth 12` alone walks deep enough to bind 12-segment paths. Raising the budget is the same compile-time trade the library documents: the `FieldPath` union grows with every level, and every path-taking call in the editor pays for it, so raise it for the form that needs it rather than by default. At `9` the flag is a no-op and the output is byte-identical.
