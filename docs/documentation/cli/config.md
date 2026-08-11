# Config and per-field overrides

## Project defaults

Put the flags you would otherwise retype into `formstand.config.ts` next to where you run the CLI. Explicit flags always win over the file.

```ts
import { defineConfig } from "formstand-cli";

export default defineConfig({
  ui: "mui",
  layout: "module",
  sections: "panel",
  columns: 2,
  live: false,     // --live default
  formProp: false, // --form-prop default
});
```

`defineConfig` is an identity function with types attached, so you get completion and typo checking in the config file itself. `ui` accepts the same spellings as `--ui`, including the pinned `"mui@5"` through `"mui@9"` and the explicit `"chakra@3"`, `"mantine@9"`, `"antd@6"`.

The CLI looks for `formstand.config.{ts,mts,js,mjs}` in the working directory, or wherever `--config <file>` points. Pair it with `--watch` for a schema-first loop: edit the schema, the module regenerates with your house style already applied.

## Per-field component overrides

Sometimes a field's schema kind doesn't imply the control you want. The classic case is a string whose suggestion list is **data**, not a zod enum: an airport code backed by an airport list, a city, a tag that mostly repeats. The `fields` block names such fields by path and swaps the emitted control.

```ts
export default defineConfig({
  fields: {
    "icao": { component: "autocomplete", optionsProp: true },
    "crew.*.role": { component: "autocomplete", optionsProp: true },
    "aircraft": { component: "autocomplete" }, // enum: select becomes a combobox
  },
});
```

### Paths

Paths are exact dot paths against the walked schema. A `*` segment matches one array index, so `"crew.*.role"` is the `role` field of every `crew` row and `"tags.*"` is the rows of a string array.

A path that matches nothing is a generation-time **error**: exit 1, nothing written, with near-miss suggestions in the message. A silently ignored override would be worse than a loud failure, since you would ship the wrong control without noticing.

### What an override means

**Free text with suggestions.** The field stays a string the user can type freely, and the list only suggests. Strict select-from-list is still what an enum gets by default. An override is how you say "this string has known likely values", not "restrict this field".

### Where the options come from

A **string** field has no other source, so it requires `optionsProp: true`. The generated component then takes a required `{camelPath}Options: readonly string[]` prop: `"crew.*.role"` becomes `crewRoleOptions`, dropping `*` segments, camel-joining the rest, and appending `Options`. Name collisions get `2`, `3`, and so on, like every other derived identifier.

An **enum** field defaults to its own values as the suggestions. Adding `optionsProp: true` replaces them with the prop.

Non-string and non-enum fields are errors, as are fields the walker had to degrade to a TODO, and (under `--layout module`) fields inside objects nested in array rows.

### What gets emitted per kit

| `--ui` | Control |
| --- | --- |
| `plain` | `<input>` plus a native `<datalist>`, dependency-free |
| `mui` | `Autocomplete` with `freeSolo`, bound through `inputValue` and `onInputChange`; `renderInput` is the kit `TextField` with label, error, and helper text |
| `shadcn` | `Input` plus a native `<datalist>`, since shadcn's combobox is a copy-paste recipe rather than an installable component |
| `chakra` | `Input` plus a native `<datalist>` inside `Field.Root`. Chakra 3's `Combobox` is Ark's collection-API compound component, which is out of proportion for generated suggestions |
| `mantine` | `Autocomplete`, which is natively this exact semantic: `value: string`, `onChange(value)`, `data` |
| `antd` | `AutoComplete`, value-shaped like its `Select`, with `status` for errors and `id={path}` for the focus-helper fallback |

Both layouts thread the options prop from the top-level component down, including through module section files, row files, and nested-array extractions. Overrides compose with `--live` and `--form-prop`, joining the same generated props type. Each override site carries a short comment naming its options source.

A [custom template](./templates) owns per-kind rendering, but an overridden field has opted out of its kind, so the override wins for that field and the template keeps every other one.

`component: "autocomplete"` is the only flavor today. The shape leaves room for more.

## Per-field layout placement

The other thing the `fields` block can say about a field is how much room it gets in a multi-column section. With `--columns 2` or `3` every field normally takes one column; `span` widens the ones that deserve more.

```ts
export default defineConfig({
  columns: 3,
  fields: {
    "employment.notes": { span: "full" }, // the whole row
    "employment.jobTitle": { span: 2 },   // two of the three columns
  },
});
```

`span` takes `"full"` or an integer of at least 2, and a number at or past the column count means the full row. It composes with a component override on the same field: `{ component: "autocomplete", optionsProp: true, span: "full" }` is one entry.

Each backend emits the span in the same layout dialect its section grids use: mui widens the field's `Grid` cell (`size={{ xs: 12, sm: 8 }}` for two of three columns, with the legacy `item xs/sm` spelling on `mui@5` and `mui@6`), mantine the `Grid.Col` span object, antd the `Col` `xs`/`sm` pair, shadcn a `md:col-span-N` wrapper, chakra a `Box` with a responsive `gridColumn`. Every spelling collapses to one column on a phone along with the grid itself. The plain backend is the one exception, for partial spans only: inline styles cannot carry a media query, so a numeric span widens to the full row and the generated file says so in a comment at the site. `span: "full"` is exact in every backend.

A span with no grid to act on is a generation-time error rather than a silent no-op: on a root-level field (the root list stacks in every layout), inside array rows (rows stack too), on a container (sections already span the row), on a 1-column form, or, under `--layout module`, on a field nested deeper than a section's direct children (deeper objects render there as stacked fieldsets; `--layout single` grids every level).

## Descriptions become helper text

You don't need config for this one. A field's zod description is picked up automatically and rendered as the control's helper text:

```ts
const schema = z.object({
  grossWeight: z.number().describe("1,000 lbs"),
  cruiseAltitude: z.number().meta({ description: "feet MSL" }),
});
```

In zod v4, `.describe()` and `.meta({ description })` write the same registry entry, so the last call wins. Across wrappers, the outermost entry present wins, which means `z.number().describe("x").optional()` and `z.number().optional().describe("x")` both capture. In type mode, a member's leading JSDoc description is used and re-emitted into the generated schema as `.describe()`.

Each kit renders it in its own slot: mui uses `helperText`, where an error takes the slot while present; shadcn a muted `<p>` and antd a `Typography.Text type="secondary"` line, both shown only when there is no error; chakra `Field.HelperText` under the same guard; mantine the native `description` prop, which has its own slot and coexists with `error`; plain an always-visible `<p className="zf-help">`, since formstand's built-in components own the error line internally.

Booleans get helper text on shadcn, mantine, and plain, and are skipped where the control has no slot for it (mui's `FormControlLabel`, chakra's `Switch.Root`, antd's bare `Checkbox`). Custom templates receive it as `ctx.description`.

Unit adornments (a prefix or suffix element) are not generated. The kits' adornment APIs are mutually incompatible, and helper text covers the units case well enough.
