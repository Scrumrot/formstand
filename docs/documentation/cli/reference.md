# Command reference

```
formstand-gen <input file> [flags]
```

## Flags

| Flag | Meaning |
| --- | --- |
| `--export NAME` | which export holds the zod schema (zod mode); `default` works. Falls back to the default export, then the sole schema export |
| `--type NAME` | expand this TypeScript type or interface instead, generating the schema too |
| `--ui plain\|mui[@5\|6\|7\|9]\|shadcn\|chakra\|mantine\|antd` | output style, default `plain`. See [UI kits](./ui-kits) |
| `--layout single\|module` | one file (default) or a feature-module folder. See [Layouts](./layouts#module-layout) |
| `--sections flat\|panel\|collapsible` | section chrome, default `flat` |
| `--columns 1\|2\|3` | field columns inside each section, default `1`. Nested sections span the full row |
| `--live` | no submit scaffold; adds an `onValuesChange` prop and defaults the mode to `"onChange"`. See [`--live`](./layouts#live-forms-with-no-submit) |
| `--form-prop` | the page owns the form: adds a `form` prop and exports a `use{Name}Form()` hook. See [`--form-prop`](./layouts#form-prop-the-page-owns-the-form) |
| `--name MyForm` | component name, default derived from the schema or type name |
| `--out FILE` | write here instead of stdout; names the folder under `--layout module`. Parent directories are created |
| `--schema-out FILE` | type mode: where the generated zod schema goes, default `<schemaName>.ts` next to `--out` |
| `--max-depth N` | nesting budget before a level degrades to a string plus a TODO. Default is derived from the typed-path budget as `9 + 2 = 11`, so path-budget degradation always wins over walker truncation. Also the recursion backstop and the bound on nested-array row extraction |
| `--config FILE` | config file, default `formstand.config.{ts,mts,js,mjs}` in the working directory. See [Config](./config) |
| `--template FILE` | a custom template module for a kit formstand doesn't ship. `--layout single` only, and it overrides `--ui`. See [Templates](./templates) |
| `--watch` | regenerate whenever the input changes; requires `--out` |
| `--force` | allow overwriting existing files |
| `--wizard` | ask the flag questions interactively, one at a time. Runs alone; see below |
| `--help`, `-h` | usage |

Without `--out`, code goes to stdout while notes and warnings go to stderr, so redirection stays clean. Writes are all-or-nothing: if any destination exists and `--force` isn't set, nothing is written.

## The wizard

`formstand-gen --wizard` walks through the questions the flags answer, one at a time: which file, zod export or TS type, which kit, which layout, section chrome, columns, name, and where to write. Enter accepts the default shown on every question, invalid answers re-ask instead of exiting, an existing output target offers `--force` on the spot, and the interview ends by printing the composed `formstand-gen` command before asking to run it, so the run is reproducible without the wizard from then on.

Three properties worth relying on. It is strictly opt-in: nothing prompts from a bare `formstand-gen` or a TTY check, so scripts and CI keep their contract. It takes the flag alone: a half-flags, half-questions run would have two sources of truth, so any other flag beside `--wizard` is an error. And every prompt writes to stderr, so a run that ends streaming the component to stdout stays cleanly pipeable; the answers can even be piped in on stdin, one per line.

## What gets generated

- **`useForm` and typed `initialValues`.** Strings start `""`, booleans `false`, numbers, dates, and enums `undefined`, nullable fields `null`, arrays `[]`.
- **Defaults are honored** when they are safe. A field wrapped in `.default()` or `.prefault()` starts at its default if the value is a JSON-serializable primitive matching the field kind: a string, a finite number, a boolean, or a declared enum option. Factory defaults are read through zod v4's resolving `defaultValue` getter, never invoked by the CLI, and only used when two reads agree, since a non-deterministic factory such as `Date.now` would break byte-reproducible output. Date, object, and array defaults have no safe source literal, and degraded fields never seed one; all of those fall back to the blank values above.
- **One bound control per field**, picked from the field's kind.
- **Nested objects** as sections, framed by `--sections`.
- **Arrays** via `useFieldArray`, with stable row keys, add and remove buttons, and a typed empty-item constant.
- **Descriptions as helper text**, from `.describe()`, `.meta({ description })`, or JSDoc in type mode. See [Descriptions](./config#descriptions-become-helper-text).
- **A submit handler and a button** disabled while submitting, unless `--live` replaces the whole scaffold with a values subscription.

## Supported schema surface

`string`, `number` and `int`, `boolean`, `date`, `enum`, unions of string literals, `object`, `array`, and `tuple`, with `.optional()`, `.nullable()`, `.default()`, and `.pipe()` unwrapped.

Tuples (`z.tuple([...])`, or `[A, B]` in type mode) render fixed positional controls at static numeric-index paths such as `coord.0` and `coord.1`, in both layouts.

Arrays nested inside array rows extract a `useFieldArray`-owning row component at **every** level, recursively, in both layouts, bounded by `--max-depth`. Each enclosing row's index threads down as a `p0`, `p1`, and so on prop, so `teams[] › members[] › phones[]` all generate. Single-file emits a child `{Stem}Rows` component with a typed `form` prop above the main component; module layout emits a `Row` and `Rows` pair per level in the section file.

`date` fields are fully supported on formstand 0.9 and newer: plain output emits `<DateField>`, and every kit adapter binds a native date input through `dateToInputText` and `parseDateText`.

## How unsupported shapes degrade

The generator never emits silently broken code. Anything outside the supported subset degrades loudly, and the file still compiles.

- **Unsupported zod kinds** (unions of objects, records, maps) and **unsupported type shapes** (generics, callable types, methods) become a text field with a `// TODO` comment naming what was skipped.
- **Non-scalar tuple elements** and a tuple's **variadic rest** (`z.tuple([...], rest)`) degrade to a TODO at that position. The fixed scalar positions still generate.
- **A non-array shape inside an array row**, meaning a nested object, union, or tuple, stays a TODO.
- **Recursive schemas** written with zod's getter idiom are cut off with a TODO rather than a stack overflow. The walkers carry a seen-set, which catches a directly self-referential schema, plus the `--max-depth` budget as the backstop for getters that mint a fresh schema on each access. The IR is always finite.
- **Field names containing `.`** are not path-addressable in formstand, since paths split on dots. The key stays in the schema and in `initialValues`, but its binding is replaced by a TODO comment and the CLI warns on stderr.
- **Hostile names** (quotes, backticks, braces) are escaped per context. Generated output is typechecked against the real library in the CLI's own CI.

### The two depth budgets

`FieldPath` stops at **9 segments** by default, and an array level spends two of them (name plus row index). A binding whose full path would exceed that degrades to a TODO comment plus a warning, while the subtree is still materialized in the schema and `initialValues`. Paths exactly at the limit bind normally.

The walker's own budget is derived as the path budget plus 2, so at default flags a leaf of up to 10 segments is walked truthfully and degrades through the *path* budget, giving you a real, correctly typed subtree with a depth TODO on the binding. A leaf deeper than that, meaning 11 or more segments at default flags or past an explicit `--max-depth`, is truncated by the *walker* instead: it becomes a string-kind placeholder whose kind and flags may no longer match the schema, `initialValues` picks up an `as unknown as` cast, and the CLI prints a per-path truncation warning telling you to raise `--max-depth` or bind by hand.

The library can widen a form's budget with `createForm`'s type-level [`pathDepth`](../typed-paths#how-path-segments-are-interpreted) option. A matching `--path-depth` flag is not implemented yet, so bind those paths by hand for now.
