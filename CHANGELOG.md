# Changelog

## formstand-cli Unreleased

### Changed

- **`--columns` output is responsive.** `--columns 2` now means "two columns
  when there is room, one on a phone" in every backend's own dialect: MUI gets
  an `sx` breakpoint object, chakra a responsive `gridTemplateColumns` style
  prop, mantine `SimpleGrid cols={{ base: 1, sm: N }}`, and the inline-style
  backends (plain, antd) a `repeat(auto-fit, minmax(...))` track whose calc
  caps the column count at N while a 220px floor collapses columns that would
  squeeze inputs below a usable width. shadcn already collapsed via
  `md:grid-cols-N`. Fixed grid tracks were why generated multi-column forms
  were unusable on phones; regenerate to pick the new grids up.
- **antd sections lay out with `Row`/`Col`** instead of an inline CSS grid:
  the kit's own 24-column idiom, responsive via `xs`/`sm` props, in both
  layouts. Nested sections, arrays, unions, and tuples ride spanning or item
  `Col`s; a union section keeps its vertical shell, since its children are
  conditional fragments that cannot each be a `Col`. This is also the shape
  that makes a per-field span a one-prop change later.

## 0.15.0 — 2026-08-04

### Fixed

- **`persistForm` no longer applies a draft from a different schema shape.**
  The stored JSON was cast straight to the values type and adopted, so a draft
  written before a schema change rebased the form onto values its own schema
  rejects. Because the default `adopt` mode clears errors and resets the
  baseline, the form then read **clean** while holding them, which is the worst
  version of the failure.

  A draft is now ignored when its shape conflicts with the form's: a path
  holding a string where the form expects an object, an array of strings where
  it expects rows. Only overlapping paths are compared, and only their kinds,
  so a half-filled draft still restores (a draft is work in progress and would
  fail full validation by design), and so does one that filled an optional the
  initial values left empty.

### Added

- **`persistForm`'s `version` option.** Renames and removals are invisible to
  the shape guard above, because JSON drops undefined slots and an absent key
  is indistinguishable from an unfilled optional. `version` covers those: it is
  stored with the draft and a mismatch discards it. Leaving it unset keeps the
  stored format byte-identical, so existing drafts survive the upgrade.

## 0.14.0 — 2026-07-31

### Added

- **`formstand/devtools`**: a form-aware debugging panel, `<FormstandDevtools
  form={form} />`, shipped as a subpath of the existing package so there is
  nothing extra to install and no version to keep in step. It renders one row
  per leaf path with the value, error, and touched/dirty/validating flags;
  surfaces the errors that belong to no field (the root `""` key, array-level
  messages, server verdicts on paths that hold no value yet); shows the two
  error channels separately, including whether a server verdict is visible or
  sitting behind a schema message at the same key; renders `diff()` as a live
  PATCH preview; and wires `snapshot()`/`restore()` to buttons for time
  travel. Renders nothing in production builds, on the same `NODE_ENV` gate
  `createForm`'s `devtools` option uses.

  It complements rather than replaces that option: the Redux DevTools
  extension gives a cross-store action log but only ever sees the merged error
  map, which is exactly the distinction this panel exists to show. Dirtiness
  comes from `getFieldState` so the panel can't disagree with `useIsDirty`,
  and styling is inline so no host stylesheet can restyle it into lying.

## formstand-cli 0.10.1 — 2026-07-30

### Fixed

- **The template-hole regex is linear again** (CodeQL `js/polynomial-redos`,
  high). `pathSegmentCount` strips holes like `${index}` before counting dot
  segments, and its pattern excluded only the closing brace, so an
  unterminated run such as `"${{${{${{..."` rescanned to the end of the
  string from every `${` start: 1.8 seconds at 32k repetitions, growing
  quadratically. Excluding both braces bounds each scan at the next brace
  and makes the same input flat. A hole is always a plain identifier, so
  real paths are unaffected and every committed demo regenerates
  byte-identical. Matters because `formstand-cli/codegen` is the documented
  browser-safe surface: the playground's Schema builder runs it on pasted
  input, and anything built on it may accept a schema it did not author. The
  binary alone was never really exposed, since generating from a hostile
  schema already executes that module.

## 0.13.0 — 2026-07-29

### Added

- **`useFormValues(form)`** — whole-values subscription in render: returns
  the form's current values object, typed `z.input<TSchema>` (structural
  `FormStateApi` forms read `unknown`). Sugar for
  `useFormSelector(form, (s) => s.values)`, reference-compared — the store
  replaces the values object immutably, so the hook re-renders exactly when
  some value changes and never on touched/error/submit churn. The motivating
  case: form values driving derived rendering (a map re-rendering from live
  coordinates). The playground's three whole-values subscriptions (Autosave,
  the MUI checkout's review step, the Schema builder's live preview) now use
  it, and the MUI adapter's number binding now goes through the exported
  `useNumberInput` (as `useMuiNumberFieldProps`) — the same shape
  `formstand-gen --ui mui` emits.

### Fixed

- **Explicit type arguments on a schema-typed form now fail with a readable
  error.** `useField<Values>(form, "email")` (any explicit generics on a
  `Form` — the value type infers from the path, so they were always an
  error) used to resolve onto the schema-less overload and die with a
  baffling `"... not assignable to type 'undefined'"` brand mismatch. A
  trap-guard overload now intercepts that shape and blames the path
  argument with instructions: `Argument of type '"email"' is not assignable
  to parameter of type '"Remove the explicit type argument: a schema-typed
  form infers the value type from the path"'`. Same guard on
  `useFieldArray` (`"... infers the item type from the path"`) and
  `useVariantField` (`"... infers the variant value from the union path
  and field"`). Inferred calls, structural-form explicit generics,
  selector paths, and explicit instantiation expressions
  (`typeof useField<Schema, "name">`,
  `typeof useVariantField<Schema, "payment", "cardNumber">`) are all
  unaffected — the guard's type parameter defaults to an unexported
  sentinel no inferred call can produce.
- **`setValue` with the identical value is now a full no-op.** Writing the
  value already at the path used to rebuild the values object anyway, so
  `useFormValues` re-rendered and `watchValues`/`onValuesChange` fired on
  writes that changed nothing — and a two-way sync that echoes values back
  (each side writing what it just received) recursed until the stack
  overflowed. `form.setValue` now identity-guards (`Object.is`) the write:
  the state reference is unchanged, no dirty/error recompute runs, no
  subscribers fire, and `useField().setValue` skips its revalidation gate
  too (nothing changed, so the current error state already reflects the
  value). The no-op is deliberately FULL: a no-op write also no longer
  releases server errors on the path or clears array-op records — those
  side effects belonged to an actual value change. One carve-out: writing
  `undefined` over an ABSENT key is still a real write (it creates the
  key — `{}` vs `{ nickname: undefined }` differ in key count, which
  dirtiness and the persisted shape observe). `setValues`, `adoptValues`,
  and `updateState` replace wholesale by design and are unchanged.

## formstand-cli 0.10.0 — 2026-07-29

### Added

- **Per-field component overrides — `fields` in `formstand.config.ts`,
  with an `autocomplete` flavor and a generated options prop.** The
  motivating case (straight from the dogfood project): an ICAO airport
  field is a plain `z.string()` whose suggestion list is DATA — an airport
  list, not a zod enum — so the CLI emitted a bare text input and the page
  hand-swapped it for the kit's autocomplete on every regeneration. Now
  the config names the field and the component:

  ```ts
  export default defineConfig({
    fields: {
      "icao": { component: "autocomplete", optionsProp: true },
      "crew.*.role": { component: "autocomplete", optionsProp: true },
    },
  });
  ```

  Paths are exact dot paths against the walked schema, `*` matching one
  array-index segment. The semantic is **free text with suggestions** (the
  one autocomplete meaning every kit shares): the field stays a string the
  user can type freely; strict select-from-list remains the enum/Select
  path. Overrides apply to **string** fields (`optionsProp: true` is
  required — there is no other options source; the generated component
  gains `{camelPath}Options: readonly string[]`, e.g. `"crew.*.role"` →
  `crewRoleOptions`, collision-suffixed like every derived identifier) and
  **enum** fields (the select upgrades to a combobox seeded with the enum
  values baked in; `optionsProp: true` REPLACES them with the prop).
  Everything else is a loud generation-time ERROR, exit 1, nothing
  written: an unknown path (with near-miss suggestions), a non-string/enum
  target, a string without `optionsProp`, a walker-degraded or
  over-FieldPath-budget field, an override under a row-nested object with
  `--layout module` (that layout degrades those to a TODO). Per-kit
  bindings, each proven against the real installed `.d.ts` by the matrix:
  MUI `Autocomplete` `freeSolo` bound through the INPUT value
  (`inputValue`/`onInputChange`, so typing and picking both update the
  form); Mantine `Autocomplete` (natively this semantic — value-shaped
  `onChange`, `data` accepts readonly arrays); antd `AutoComplete`
  (value-shaped like its Select, `status` for errors, `id={path}` for the
  focus-helper fallback — no `name` exists); plain, shadcn, and Chakra ride
  an `Input` + native `<datalist>` (shadcn's combobox is a copy-paste
  recipe, not an installable component; Chakra 3's `Combobox` is Ark's
  collection-API compound component — disproportionate for generated
  free-text suggestions, so the DOM-shaped datalist is the honest
  binding). Both layouts thread the options prop root → section → row/field
  files (nested-array extractions included); composes with `--live` and
  `--form-prop` (the props join the same props type); an overridden field
  wins over a custom `--template`'s per-kind renderer (templates own
  per-KIND rendering; an override opts the field out of its kind). Each
  override site carries a short generated comment naming the options
  source. `component: "autocomplete"` is the only flavor this cycle; the
  config shape is a discriminated union so future flavors (textarea,
  slider, ...) slot in. The playground's flight-search demo now generates
  its origin/destination ICAO fields through the override (the suggestion
  list passed by the page), making the dogfood project's exact page real
  CLI output.
- **`--live` — live/no-submit scaffold mode** (config key `live`). For
  forms nothing ever submits (a map or preview re-rendering from every
  value change): the submit scaffold — `handleSubmit`, the submit button,
  `useIsSubmitting` — is omitted entirely; the generated component instead
  accepts an optional `onValuesChange?: (values) => void` prop wired
  through `form.watchValues` in a `useEffect` (watchValues has shipped
  since formstand 0.2 and returns its own unsubscribe, so generated output
  keeps a low version floor; the emitted comment names `useFormValues` as
  the post-0.12 render-side one-liner). The root element stays a `<form>`
  (label association, the form landmark, kit chrome unchanged) with a
  `preventDefault` `onSubmit` so the browser's implicit Enter-key
  submission can't navigate the page. The emitted validation mode defaults
  to `"onChange"` — a live consumer wants validity that tracks the values,
  not the library-default `"onBlur"` lag (noted in the emitted comment).
  Kit `Button` imports stay usage-gated: array add/remove buttons keep
  them, an array-free live form drops them. Works with all six `--ui`
  kits, custom `--template`s, and both layouts (`--layout module` defaults
  the singleton's `createForm` mode and rewires the form file; the
  pre-wired hook API is unchanged).
- **`--form-prop` — page-owned-form scaffold mode** (config key
  `formProp`). The generated component's props gain
  `form: Form<typeof schema>` and it stops creating its own form; the
  `useForm` scaffold is still emitted, as an exported `use{Name}Form()`
  hook the page calls — so one instance can feed the generated UI and any
  other consumer (the dogfood case: a page-level form driving a map AND
  the form UI). In `--layout module` the component takes the same prop for
  its shell (submit/subscription) while the field hooks stay pre-wired to
  the module singleton — the emitted props comment says to pass that
  exported instance. Composes with `--live`: the component becomes pure
  rendering and `onValuesChange` subscribes to the passed form.
- Internal: the per-kit form shells (single-file backends and the module
  layout) are restructured into shared open/onSubmit/submit-button/close
  pieces, so the submit and `--live` shapes are composed from one
  production and cannot drift per kit. Default-flag output is
  byte-identical.
- **Playground: the two modes as a living demo** — a new Generated tab
  (**Gen: live + form prop**) renders a compact flight-search schema
  generated with `--live --form-prop` (`--ui plain`, single-file,
  committed untouched and drift-checked via
  `scripts/generate-cli-demos.mjs` like the other generated demos) next to
  a hand-written consumer page: the page owns the form via the exported
  `useFlightSearchForm()` hook and a live values panel renders only what
  `onValuesChange` delivers — updating per keystroke, the map-driven case
  in miniature. Smoke-tested in the root suite (mount, type, assert the
  panel reflects the keystroke; no submit scaffold in the output).
- **zod `.describe()` / `.meta({ description })` → generated helper text.**
  The walkers capture a field's description into the IR — zod v4 stores
  both spellings in ONE registry entry (`z.globalRegistry`, surfaced by the
  schema's `description` getter; nothing on `def`), so the rule is simply
  "the last `.describe()`/`.meta()` call wins", and across wrappers
  (`z.number().describe("x").optional()` vs `.optional().describe("x")`)
  the outermost entry present wins. Type mode captures the member's leading
  JSDoc description the same way (and the generated zod schema re-emits it
  as `.describe()`, outermost, so it round-trips). Emission per kit, both
  layouts, union variant fields and tuple elements included: mui routes it
  into `helperText` as `fieldError(field) ?? description` (the error keeps
  the one slot while present), shadcn a muted
  `<p className="text-sm text-muted-foreground">` and antd a
  `Typography.Text type="secondary"` line — each rendered only while the
  error line is not — chakra a `Field.HelperText` under the same guard,
  mantine the native `description` prop (its own slot, coexists with
  `error`), and plain an always-visible `<p className="zf-help">` line
  (formstand's built-in components own the error slot internally).
  Booleans are skipped where the control has no slot (MUI's
  FormControlLabel/Switch, chakra's Switch.Root, antd's bare Checkbox);
  shadcn/mantine/plain booleans render it. Custom templates receive the
  description as `ctx.description` (an expression like `ctx.label`; `""`
  when absent). Description-free schemas emit byte-identical output.
  Adornments from `.meta` (unit prefixes/suffixes) are deliberately NOT
  generated — the four kits' adornment APIs are value-shaped and mutually
  incompatible (InputAdornment / rightSection / InputElement / suffix);
  helper text covers the units case. Visible in the playground: the
  flight-search demo's `cruiseAltitude` now carries `.describe("feet MSL")`.

### Fixed

- **`--layout module`: autocomplete-only schemas now compile for every
  kit.** The module adapter file's import gates missed
  `usage.autocomplete`: a schema whose every string/enum field carries the
  autocomplete override emitted chakra/shadcn adapters using `ChangeEvent`
  without importing it (their override rides the kits' text adapter), and
  the antd adapter's `FieldError` used `Typography` without importing it.
  The single-file backends already gated these correctly; the module gates
  now mirror them (mui/mantine/plain were already correct — mui's
  autocomplete types `SyntheticEvent`, mantine's and antd's are
  value-shaped).
- **`--layout module --form-prop`: the emitted component now warns in dev
  when the passed form is not the module singleton.** The module's field
  hooks are pre-wired to the exported singleton; a different form of the
  same schema compiled and rendered but silently split state (the shell on
  the prop, the fields on the singleton). The generated component now
  compares the prop against the singleton and `console.warn`s outside
  production (`NODE_ENV` gate, same shape as the library's own dev
  warnings), naming the instance to pass. Documented as an emphasized
  contract note in the CLI README's flags section.
- **Override near-miss suggestions no longer offer paths the validator
  would reject.** The "did you mean ...?" candidate list for an unknown
  `fields` path now filters out dot-containing (unaddressable) names,
  walker-degraded leaves, and paths past the FieldPath depth budget — the
  same predicates `applyFieldOverrides` errors on, so a suggestion can
  always actually be used.
- Internal: `ownerHookName` and `hasStaticDescriptions` are no longer
  exported from codegen (no external consumer), and `overridablePaths`
  left the `formstand-cli/codegen` public surface (it is the validator's
  internal near-miss walk).

## 0.12.0 — 2026-07-29

### Changed

- **`useFieldArray` ops revalidate the array path** — push/remove/insert/
  move/swap now re-run field validation on the array's own path after the
  op, under the exact change-trigger gate `useField.setValue` applies
  (`shouldValidateOn` over mode/reValidateMode/submitCount/touched). This
  fixes a visible array-level error (`z.array().min(1)` after a failed
  submit) going stale: adding the row didn't clear the message, and
  removing below `.min` raised nothing until the next submit. Upgraders
  note: in `onChange` mode (or after the first submit) array ops now
  trigger a validation pass — including async refines — where 0.11 stayed
  silent; `onSubmit` forms remain silent before the first submit, exactly
  like typing in a field. The IMPERATIVE `form.arrayPush`/`arrayRemove`
  stay non-revalidating on purpose, matching the `form.setValue` vs
  `useField.setValue` layering.

### Added

- **`FieldArrayFormApi.validateField` (optional)** — the member the hook
  probes for the revalidation above. A `Form<TSchema>` always provides it;
  hand-rolled `FieldArrayFormApi` implementations without it keep working,
  their ops simply skip revalidation (documented in the API reference's
  implementing-these-interfaces notes).

### Fixed
- **`focusFirstError` / `focusField`: a hidden name-carrier no longer
  suppresses the `[id=path]` fallback.** Composite widgets like
  react-select render a hidden `<input name={path}>` for form posting next
  to a focusable control carrying `id={path}`; the hidden input claimed the
  path as "named" even though it can never take focus, so the id element
  was never tried. Whether a path counts as name-matched is now judged
  against focus-CANDIDATE controls only.
- **`focusFirstError` / `focusField` harden against control characters in
  paths** — the CSS-string escaping behind the `[id=path]` fallback now
  hex-escapes control characters (`\n`, DEL, ...), so a hostile or
  accidental newline in a path builds a valid selector that matches
  nothing instead of making `querySelectorAll` throw.

## formstand-cli 0.9.1 — 2026-07-29

### Fixed

- **Hoisted `${var}NumberProps` consts respect the identifier registry.** A
  schema field literally named like the derived const of a kit number
  binding (`price` + `priceNumberProps`) generated a duplicate `const`
  declaration — the file failed tsc — in single-file union bodies AND
  module-layout rows/tuple/union sections. Number bindings now reserve BOTH
  their own var and the derived `${var}NumberProps` name through the
  identifier-suffix machinery at allocation time, so the colliding field
  suffixes (`priceNumberProps2`) instead.
- **Array-level error lines announce in every kit**: the mui / chakra /
  mantine array errors (both the single-file emitters and the module
  layout's list shells) now carry `role="alert"`, matching plain, shadcn,
  and antd — a `z.array().min()` message is announced to assistive tech,
  not just painted.
- **Version-floor wording updated for the shipped release**: the emitted
  antd comment, its non-emitted twin, the inline `useNumberText` note, and
  the README now say "formstand >= 0.11.0" for the focus-helper `[id=path]`
  fallback (previously "formstand > 0.10.0", written before 0.11.0 had a
  number).

### Changed

- **HELP's `--ui` line is built from structure, not regex surgery**: the
  flag spelling derives from the new `UI_KITS` list plus `MUI_VERSIONS`
  (exported from `uiTarget.ts`, which `UI_CHOICES` also derives from), so a
  new kit or MUI major updates every listing at once. The rendered text is
  unchanged.
- Internal consolidation: the string/date adapter names at the module
  layout's import sites and the single-file Bound* component bodies now
  route through `kitScalarBinding` — one production feeds both the import
  and JSX spellings per kit — and `ModuleUi` derives from the exported
  `KitUi` union instead of restating the kit list.

## 0.11.0 — 2026-07-29

### Added

- **`useNumberInput` is exported** (along with its `NumberInputBinding`
  return type) — the text-preserving number binding behind `NumberField`.
  It was implemented and tested (via `NumberField`) all along, just never
  exported: local raw text while editing (partial entries like `-`, `1.`,
  `85000.` stay visible), keystrokes that parse pushed to the form via the
  shared `parseNumberText` rules, blur snapping the display to the
  canonical value, and an external form-value change while editing
  resetting the local text. Spread it onto an `<input type="text">` for
  custom number inputs and UI-kit adapters — a naive controlled
  `value={String(n)}` binding eats the `.` of `85000.50` and the `-` of
  `-5` as they are typed.

### Fixed

- **`focusFirstError` / `focusField` gain an `[id=path]` fallback** for
  paths that match NO named control: composite widgets that render no
  `name` anywhere — Ant Design's `Select`, notably, which has no
  form-posting input — were unreachable by the name walk even though they
  forward `id={path}` to their real focusable control. When a path has no
  name-matched control, the helpers now try the element whose `id` is
  exactly that path (EXACT match only — descendant semantics stay with the
  name walk, since an id names one element), with the same focusability
  filter, post-focus verification, and DOM-order merging as name matches.
  Paths with any named control never consult ids, so existing behavior is
  unchanged wherever a `name` exists.

## 0.10.0 — 2026-07-28

### Breaking

- **`validateFields` / `validateFieldsAsync` return discriminated results
  instead of booleans** (2026-07 self-review #1). `validateFields(paths)` now
  returns `{ kind: "valid" }`, `{ kind: "invalid", errors }` (the error map
  scoped to the requested paths), or `{ kind: "pending", promise }` on an
  async schema — mirroring `validateField`. The old `boolean |
  Promise<boolean>` union let a truthy in-flight `Promise` silently pass
  `if (form.validateFields(...))` gates the moment a schema gained an async
  refine. `validateFieldsAsync` resolves with the settled result instead of a
  boolean. Migrate `if (ok)` to `if (result.kind === "valid")`.
- **`FieldFormApi.validateField` must not throw the async-required signal**
  — `useField` no longer catches it and escalates to `validateFieldAsync`.
  The declared contract (return `{ kind: "pending", promise }`) has been the
  library's own behavior since the async-routing rework; custom
  implementations written against the old throwing style should return the
  pending result instead.

### Added

- **`pathDepth` option on `createForm`/`useForm`** — a type-level-only,
  per-form typed-path depth budget (in segments): `createForm(schema, {
  initialValues, pathDepth: 12 })` widens the `FieldPath` union so deeper
  paths bind with full inference, threading through every typed surface
  (`Form<TSchema, D>`, `useField`/`useFieldArray`/`useVariantField`, the
  flag/selector hooks, `createFormHooks`, `createFormContext<S, D>`, the
  bound components' `PathsOf`). The runtime ignores it entirely — path APIs
  always walked any depth — and D infers as a literal from the option.
  Motivated by one global store backing many forms, whose leaves sit past
  the default budget. Raising it is a deliberate TypeScript compile-cost
  trade: the union grows with every extra level, and every path-taking call
  in the editor pays for it. `D` must be a number literal; budgets up to 25
  are supported, and the option is CONSTRAINED to the exported `PathDepth`
  union (`0 | 1 | ... | 25`, exactly the decrement table's range) —
  `pathDepth: 26`, `pathDepth: -1`, a widened `number`-typed variable, and
  a UNION value (`cond ? 12 : 9`, which would infer an unusable
  `Form<S, 9 | 12>`) all fail to compile at the call site instead of
  silently misbehaving. The same `D extends PathDepth` constraint is
  enforced on EVERY generic surface carrying a depth parameter — `Form`
  itself, `createFormContext<S, D>`, `persistForm`, the hooks'
  explicit-`D` positions — so `Form<S, number>` and
  `createFormContext<S, 26>()` are compile errors too, not silently
  unbounded budgets.
  `FieldPath<T, D>` itself (the compat surface for direct users, still
  `D extends number`) NORMALIZES any unusable `D` before recursing: a
  widened `number` (an options object built separately), an out-of-range
  literal (26, -1 — outside the decrement table, where the decrement would
  silently no-op), and a finite union (`9 | 12`, or `PathDepth` itself —
  the decrement distributes over unions and would recurse to the union's
  max) all fall back to the default depth instead of silently building the
  enormous ~25-level union (an empirically verified hazard) or
  hard-erroring TS2615 on recursive value types. The default is now the exported
  `DefaultPathDepth` alias — one source of truth replacing the 22 scattered
  `= 9` literals across the typed surfaces. NOT breaking for existing
  code: `D` is appended LAST with a
  default on every generic surface (the hooks' typed overloads
  forward-reference it from the path parameter's constraint, and the
  selector overloads stay at one type parameter), so existing references —
  `Form<Schema>`, explicit instantiations like
  `useFieldArray<typeof schema, "tags">`, `createFormHooks<S, "name">` —
  keep compiling unchanged; type tests pin the arity, the option's
  rejection cases, the non-literal fallback, and both directions of
  `Form<S, 12>` / `Form<S, 9>` non-assignability.

### Changed

- **Default typed-path depth raised from 7 to 9 segments**
  (`FieldPath<T, D = 9>`). Real-world stores kept hitting the 7-segment cap
  (the CLI's nested-array output reaches 7 with just three array levels,
  and one more object wrapper fell off the union). Measured typecheck cost
  of the wider default across this repo (library + tests + examples) is
  noise-level. `Form<Schema>` references keep compiling unchanged — the new
  `D` parameter defaults to 9 everywhere.

### Fixed

- `resetField` on a path with no counterpart in `initialValues` (an appended
  array row) no longer writes an explicit `undefined` into the values tree —
  a hole that crashed row components and failed schema validation. The value
  is left unchanged (with a console warning), and error/touched state under
  the path still clears (2026-07 self-review #2).
- `useFieldArray` row ids stay glued to the right rows even when row values
  are `Object.is`-equal (`remove(0)` on two blank rows handed the survivor
  the removed row's id, resurrecting the wrong React subtree). The core now
  records every array op's exact new→old index mapping in an internal
  per-path op log, and id derivation replays that log — so the fix covers
  hook-issued ops, IMPERATIVE ops (`form.arrayRemove(...)`), and multiple
  ops per render batch alike. All hook instances on the same path share one
  id state, so sibling `useFieldArray` hooks can never disagree on row ids.
  Whole-array writes that bypass the ops (`setValue`, `restore`) still
  reconcile by value as before, and replay keeps its exact progress when a
  chain breaks mid-batch (an op followed by a `setValue` reconciles only the
  remaining hop); consecutive log records compose when the ring fills, so
  arbitrarily long op batches stay fully replayable. Exact replay applies to
  forms created by `createForm`/`useForm` — schema-less custom
  `FieldArrayFormApi` implementations reconcile by value (2026-07
  self-review #3, completed by the deferred store-side follow-up).
- `flattenIssues` no longer crashes on an issue path of `"__proto__"`
  (reachable via `ctx.addIssue` in a `superRefine`): the accumulator read now
  checks own keys instead of walking the prototype chain (2026-07
  self-review #4).
- `SelectField` renders its empty option whenever the bound `<select>`
  displays `""` (the condition now derives from `selectProps`' own value
  coercion, covering `undefined`, `null`, AND `""`) — an empty-string value
  no longer displays as the first real option while the form holds `""`.
  An options list that supplies its own `""`-valued entry wins: the
  implicit blank option is suppressed so the explicit labelled one shows.
- `setError`/server errors keyed at `"__proto__"` are no longer silently
  dropped from the merged `errors` map (`mergeErrorChannels` now checks own
  keys, the same hardening `flattenIssues` got).

### Performance

- Async-requiring scopes are latched: once a sync `validate` /
  `validateField` / `validateFields` pass discovers a scope needs async
  parsing, later calls skip the doomed sync parse and go straight to the
  async pass (previously every keystroke on an async schema paid a full sync
  parse that always threw) (2026-07 self-review #5). One nuance: after the
  latch, a value that fails an EARLIER sync check in the same scope also
  returns `pending` (settling via the promise) where it previously settled
  `invalid` synchronously — callers on async schemas must handle `pending`
  regardless, since valid values always produced it. Paths that address no
  slot (out-of-range indices) never consult the latch and still settle
  synchronously.

### Internals

- The five bound field components share one `FieldShell` (label + control +
  error line, with the checkbox's label-wrapping layout as a variant) and one
  exported `hasFieldError` predicate — the a11y wiring (`useId`, `-error` id,
  `aria-describedby`) now lives in a single place instead of five copies.
  `hasFieldError` is exported for custom UI-kit adapters.
- `FieldPathArg` is now actually used by the `useField` / `useFieldArray`
  overloads it describes (it was exported dead).

## formstand-cli 0.9.0 — 2026-07-29

### Added

- **Version-aware `--ui`: `mui@5` … `mui@9`** — `--ui mui` can now pin an
  `@mui/material` major: `mui@5`, `mui@6`, `mui@7`, `mui@9` (bare `mui`
  keeps meaning the latest supported major, 9, and its output is
  byte-identical to before). The config file's `ui` key accepts the same
  spellings. Scope: only React-19-capable majors — formstand peers
  `react: ^19`, so MUI 4 and older can never install alongside it — and MUI
  skipped major 8 entirely (7.x jumps to 9 on the registry), so `mui@8`
  and `mui@4` fail with explanations, as do `plain@N`/`shadcn@N` (those
  kits take no version). Internally the flag/config value parses to a
  structured `UiTarget` (`{ kit: "mui", version }` | `{ kit: "plain" }` |
  `{ kit: "shadcn" }`, exported with `parseUiTarget` / `MUI_VERSIONS` from
  `formstand-cli/codegen`), and ONE mui emitter serves every major through
  a small per-version config. The only prop-surface delta across the
  emitted component set (verified empirically against each major's .d.ts)
  is TextField's slot-props API: `mui@5` emits the legacy
  `InputProps: { inputMode }` / `InputLabelProps: { shrink: true }`, v6+
  emit `slotProps.{input,inputLabel}` (v9 removed the legacy spelling;
  v6–7 accept both and get the modern one). Custom `--template` modules
  compose with a versioned `--ui` exactly as they did with bare `mui`
  (a template still overrides the ui entirely, `--layout single` only).
- **`cli/matrix/`: the UI-kit version-matrix typecheck harness** — an isolated
  workspace (own `package.json` + lockfile; not part of the root or cli
  installs) with every supported `@mui/material` major installed side by
  side under npm aliases (`mui5` … `mui9`). `npm run matrix` (from `cli/`)
  generates a kitchen-sink form plus the nested-array stress form with
  `--ui mui@N` — both layouts, every section/column variant — and
  typechecks the output against each major's real type declarations
  (`@mui/material` path-mapped onto the alias, `formstand` onto the
  library source). A per-version literal-attribute probe restates the
  adapter's TextField props style outside a JSX spread (spreads bypass
  TypeScript's excess-property checks), so a wrong per-version config
  fails the matrix instead of compiling silently. Run it before releasing
  any UI-kit backend change; it is deliberately not part of `npm test`.
  (The chakra, mantine, and antd entries below each extend the harness
  with their kit's alias and job — it ends this cycle proving seven
  targets: four mui majors, chakra 3, mantine 9, antd 6.)
- **First-class `--ui chakra`: a Chakra UI v3 backend** — both layouts
  (single-file and `--layout module`), the full field-kind surface the mui
  backend covers (strings/numbers/dates/enums/booleans, nested objects,
  arrays with add/remove and recursive nested-row extraction, tuples,
  discriminated unions, TODO degradations), and every `--sections` /
  `--columns` variant. Emits the v3 compound-component API (verified
  against the installed 3.36 declarations, not v2's): `Field.Root` (with
  `invalid`) / `Field.Label` / `Field.ErrorText` for labels and errors,
  `Input` for text/number/date (native bindings — `inputMode="decimal"`,
  `type="date"`), `NativeSelect.Root` + `NativeSelect.Field` for enums (a
  real `<select>`, preferred over the Ark collection `Select` so the
  adapter speaks DOM change events), and `Switch.Root` /
  `Switch.HiddenInput` / `Switch.Control` / `Switch.Thumb` /
  `Switch.Label` for booleans (`checked` + `onCheckedChange` details
  callback, spread on the root where the state lives). Sections render
  `Stack`/`Heading` (flat), `Card.Root`/`Card.Body` (panel), or one
  `Accordion.Root` (`collapsible defaultValue={["section"]}`) per section
  (collapsible); columns use the same CSS-grid shape as the other kits via
  chakra style props. The generated file assumes the host app mounts
  `ChakraProvider` (same policy as the mui backend and its theme). The
  module layout gains a shared `adapter.ts` (`chakraTextInputProps` /
  `useChakraNumberInputProps` / `chakraDateInputProps` /
  `chakraSelectProps` / `chakraSwitchProps` + `fieldError`). chakra takes no version suffix —
  v3 is the only supported major (v2 and older lack the compound API and
  predate formstand's React 19 peer) — with `chakra@3` accepted as the
  explicit spelling and `chakra@1`/`chakra@2` failing with the scope
  rationale like `mui@0`–`mui@4`. The config file's `ui` key accepts the
  same spellings, and the matrix harness gained a `chakra3` alias
  (`npm:@chakra-ui/react@^3`) plus a chakra job — both schemas, both
  layouts, all section styles, and a literal-attribute probe for the
  Input/NativeSelect/Switch prop surfaces — so `npm run matrix` now proves
  five kit targets against their real .d.ts.
- **First-class `--ui mantine`: a Mantine v9 backend** — both layouts, the
  full field-kind surface the other kit backends cover (strings/numbers/
  dates/enums/booleans, nested objects, arrays with add/remove and
  recursive nested-row extraction, tuples, discriminated unions, TODO
  degradations), and every `--sections` / `--columns` variant. Mantine
  field components carry their own `label` + `error` props, so there is no
  Field wrapper: `TextInput` binds text/number/date natively
  (`inputMode="decimal"`, `type="date"`; Mantine's `NumberInput` widget is
  deliberately NOT used — its `onChange` takes `(value: number | string)`,
  not a DOM event, so it can't share formstand's input-shaped adapters),
  `NativeSelect` binds enums as a real `<select>` with `<option>` children
  (same native-first choice as the chakra backend), and `Switch` binds
  booleans through plain DOM `checked`/`onChange` (a `ChangeEvent`, unlike
  chakra's details callback). Error text rides inside the adapter builders
  (`error: fieldError(field)`), so leaves are one-liners like the mui
  backend's. Sections render `Stack`/`Title` (flat), `Card withBorder` +
  `SimpleGrid` (panel), or `Accordion`/`Accordion.Item`/`Control`/`Panel`
  (collapsible, `defaultValue="section"` + `variant="contained"`); columns
  use `SimpleGrid cols={N}`. The generated file assumes the host app
  mounts `MantineProvider` (same policy as the mui/chakra providers). The
  module layout gains a shared `adapter.ts` (`mantineTextInputProps` /
  `useMantineNumberInputProps` / `mantineDateInputProps` /
  `mantineSelectProps` / `mantineSwitchProps` + `fieldError`). mantine
  takes no version suffix — v9 (the current major) is the only supported
  target, with `mantine@9` accepted as the explicit spelling. The scope is
  empirical: 9.x peers `react ^19.2` while 7.17+/8.x peer `^18 || ^19`
  (7.0 was ^18-only, ≤6 predate the v7 emotion→CSS-modules rewrite), and
  the emitted component surface typechecks IDENTICALLY against 7.17/8.3/9.5
  except the `bdrs` style prop (absent in 7) — so `mantine@0`–`6` fail
  with the React-19/styling-rewrite rationale and `mantine@7`/`@8` fail
  with a precise verified-against-v9-only message instead of a false
  incompatibility claim. The config file's `ui` key accepts the same
  spellings, and the matrix harness gained a `mantine9` alias
  (`npm:@mantine/core@^9.5`, plus its `@mantine/hooks` peer) and a
  mantine job — both schemas, both layouts, all section styles, and a
  literal-attribute probe for the TextInput/NativeSelect/Switch spread
  surfaces — so `npm run matrix` now proves six kit targets against their
  real .d.ts.
- **First-class `--ui antd`: an Ant Design v6 backend** — both layouts, the
  full field-kind surface the other kit backends cover (strings/numbers/
  dates/enums/booleans, nested objects, arrays with add/remove and
  recursive nested-row extraction, tuples, discriminated unions, TODO
  degradations), and every `--sections` / `--columns` variant. The one
  hard rule: antd's own `Form`/`Form.Item` (name-based bindings, its own
  state store) is NEVER emitted — formstand owns the form state, so the
  generated code binds antd's input components as plain controlled
  components. The bindings, decided empirically against the installed
  6.5 declarations: `Input` binds text/number/date natively (it extends
  the DOM input props — `inputMode="decimal"`, `type="date"`; antd's
  `InputNumber` is rejected on evidence, its `onChange` is
  `(value: number | null)`, not an event, and the dayjs-value-based
  `DatePicker` is not used — the CLI pulls no date library); enums bind
  antd's `Select`, the backend's ONE value-shaped adapter — antd has no
  native-`<select>` component anywhere, so `onChange` receives the
  selected value directly, `value ?? null` keeps the placeholder visible,
  and there is no `name` (antd's Select renders no form-posting input);
  booleans bind `Checkbox` (its `onChange` is antd's DOM-ish
  `CheckboxChangeEvent` with `e.target.checked`, and it has a real
  `onBlur`) — NOT `Switch`, which has no `onBlur` prop at all and a
  value-shaped `(checked, event)` callback (both rejections verified as
  failing compiles against the real .d.ts). With no `Form.Item` there is
  no built-in error slot: every non-boolean control paints
  `status="error"` (`fieldStatus`) and renders an explicit
  `Typography.Text type="danger" role="alert"` error line, with a plain
  `<label htmlFor>`/`id` pair. Sections render `Flex`/`Typography.Title`
  (flat), `Card variant="outlined"` (panel), or `Collapse` via the items
  API (collapsible — children-panels are deprecated in antd 5+); columns
  use the shared inline-style CSS grid. No provider is required
  (`ConfigProvider` is optional theming). The module layout gains a shared
  `adapter.tsx` (JSX for its `FieldError` line, like shadcn's):
  `antdTextInputProps` / `useAntdNumberInputProps` /
  `antdDateInputProps` / `antdSelectProps` / `antdCheckboxProps` +
  `fieldError` / `fieldStatus` / `FieldError`. antd takes no version suffix — v6 (the current major) is
  the only supported target, with `antd@6` accepted as the explicit
  spelling. The scope is empirical: antd 6.x peers `react >=18` (React 19
  natively in range), while antd 5 nominally peers `react >=16.9` but
  needs the `@ant-design/v5-patch-for-react-19` import in the HOST app on
  React 19 — so `antd@5` fails with a precise
  verified-against-v6-only message (naming the patch, no false
  incompatibility claim) and `antd@0`–`4` fail with the missing-surface
  rationale (no `Flex`, no Collapse items API, no `status` props; 4 and
  older predate the v5 CSS-in-JS rewrite). The config file's `ui` key
  accepts the same spellings, and the matrix harness gained an `antd6`
  alias (`npm:antd@^6.5`) and an antd job — both schemas, both layouts,
  all section styles, and a literal-attribute probe for the
  Input/Select/Checkbox spread surfaces, restating the value-shaped
  Select `onChange` with its explicit parameter type — so
  `npm run matrix` now proves seven kit targets against their real .d.ts.
- **Playground: the new kit backends as living demos** — three new
  Generated tabs (**Gen: Chakra UI**, **Gen: Mantine**, **Gen: Ant
  Design**) render the SAME Onboarding schema the mui module tab uses,
  generated single-file with `--ui chakra` / `--ui mantine` / `--ui antd`
  and the same `--sections panel --columns 2` chrome — a direct kit
  comparison across the four tabs, with one deliberate second axis: the
  mui tab is `--layout module` (the module-layout showcase) while these
  three are single-file. Committed
  untouched and drift-checked by CI like the other generated demos
  (`scripts/generate-cli-demos.mjs`), rendered behind scoped provider
  bridges that follow the playground's light/dark switch (ChakraProvider +
  a mode class, MantineProvider `forceColorScheme`, antd `ConfigProvider`
  algorithm — antd needs no provider to function), and smoke-tested in
  the root suite (mount, label association, array add/remove per kit).

### Fixed

- **Kit number adapters no longer corrupt typed numbers.** The mui, chakra,
  mantine, and antd backends bound numbers as a controlled text input
  (`inputMode="decimal"`) whose onChange immediately reparsed and
  re-rendered the canonical string — so typing `85000.50` yielded
  `8500050` (the `.` eaten as `85000.` reparsed to `85000`), `-5` yielded
  `5`, and `0.050` yielded `50` (jsdom-verified). All four now emit an
  inline `useNumberText` hook replicating formstand's own `useNumberInput`
  semantics exactly (local raw text while editing, valid keystrokes pushed,
  partial entries kept, blur snap, external-change reset) — emitted inline
  rather than imported so generated output keeps its formstand >= 0.3.0
  floor — and their number adapters became use-prefixed HOOKS
  (`useMuiNumberFieldProps` / `useChakraNumberInputProps` /
  `useMantineNumberInputProps` / `useAntdNumberInputProps`) composing kit
  chrome over it, in both layouts. Union variant blocks are conditional
  JSX, so number bindings there hoist
  `const ${var}NumberProps = use...(${var})` next to the field hooks and
  spread the const (React's rules of hooks). plain and shadcn were never
  affected (stateless `type="number"` bindings).
- **Single-file array sections render the array-level error.** All six
  single-file backends dropped `useFieldArray`'s `.error`, so a
  `z.array().min(1, "add at least one contact")` message was invisible on
  submit; the module layout already rendered it per kit. Each backend now
  emits the same error line its module-layout list shell uses (plain and
  shadcn `<p role="alert">`, mui `Typography color="error"`, chakra
  `Text color="red.500"`, mantine `Text c="red"`, antd
  `Typography.Text role="alert" type="danger"`), between the rows and the
  Add button.
- **Version-matrix hardening.** (1) The stale-install gate now derives its
  required-alias list from the job list itself and fails loudly naming
  what's missing — it previously checked only 4 of the 7 aliases, so a
  missing `mui6`/`mui7`/`mui9` silently typechecked against the repo
  root's @mui/material copy. (2) Every kit gained a module-layout PANEL
  job (`KitchenSinkPanel`, panel@2col): module-panel emitters were
  previously typechecked nowhere (a deliberate typo in that arm shipped
  green), so the matrix now genuinely covers all three section styles in
  both layouts. (3) The matrix compiles under `exactOptionalPropertyTypes`
  in addition to `strict` — the strictest consumer configuration — after
  fixing the stale antd probe lines, which restated `status={undefined}`,
  a shape the adapter no longer emits (it emits `""`, a member of antd's
  `InputStatus`). (4) The four ~60-line per-kit generator copies collapsed
  into one parameterized `generateKit` with the jobs as data.
- **Docs corrections**: the module layout works with all six uis (the
  README said three) and the adapter split is named (`adapter.ts` for
  mui/chakra/mantine, `adapter.tsx` for shadcn/antd); the
  formstand >= 0.3.0 requirement explicitly covers mantine and antd (they
  import the same surface); and the playground/README wording about the
  four "CLI output" tabs now acknowledges both axes — the mui tab is
  `--layout module` (doubling as the module-layout showcase) while the
  three kit tabs are single-file, so `--ui` is not the only variable.
- **antd `fieldStatus` returns `""` — antd's own no-status value — instead
  of `undefined`** when a field has no error. Spreading
  `status: "error" | undefined` onto antd's `status?: InputStatus` props
  fails to compile in host apps built with `exactOptionalPropertyTypes`
  (which rejects explicit `undefined` for optional properties); `""` sits
  in antd's `InputStatus` union precisely for "no status". Caught by
  wiring the playground demo — the examples package compiles with
  `exactOptionalPropertyTypes` on.

## formstand-cli 0.8.0 — 2026-07-28

### Changed

- **The typed-path budget follows the library default, now 9 segments**
  (`FORMSTAND_PATH_DEPTH` 7 → 9, tracking `FieldPath<T, D = 9>` in
  src/core/fieldPath.ts). Bindings whose full path is 8 or 9 segments —
  degraded to TODOs by the budget fix below — bind real controls again;
  10+-segment paths keep the TODO + stderr warning. In-budget output is
  byte-identical (the three-level nested-array snapshot is unchanged). The
  library's new per-form `pathDepth` option can widen a form past 9; a
  future `--path-depth` flag would pair with it (not implemented — bind
  those paths by hand for now).
- **The default walker nesting budget is now DERIVED from the path budget**
  (`DEFAULT_MAX_DEPTH = FORMSTAND_PATH_DEPTH + 2` = 11, up from the
  standalone 10; the constant moved to a shared `depth` module both walkers
  and emitters import). The walker must reach one level PAST the path
  budget so a leaf of up to 10 segments (path budget + 1) at default flags
  degrades via the PATH budget — a real, correctly typed subtree with a
  depth TODO — rather than via walker truncation, whose wrong-kind string
  fallback poisoned `initialValues` and failed the consumer's typecheck (a
  nullable number at level 10 blanked to `""` instead of `null`). Leaves
  DEEPER than that (11+ segments at default flags) still truncate to the
  string-kind stand-in; the generated file now always compiles anyway (the
  truncated leaf forces the `as unknown as` initialValues cast) and each
  truncated path gets its own stderr warning — see Fixed below. The
  DeepBoundaryForm playground demo no longer needs its `--max-depth 11`
  override, and its regenerated output is byte-identical. `--max-depth`
  remains as an override and the recursion backstop.
- **One boundary predicate for every depth decision.** The ~38 hand-written
  `>`/`>=` comparisons against `FORMSTAND_PATH_DEPTH` across the
  single-file and module emitters are replaced by a single exported
  `overDepthBudget(spec, segments)` — spec-aware (it picks the
  at-the-budget vs needs-headroom boundary from the spec's kind) and used
  at every depth decision in both layouts and the CLI warnings, so they
  can no longer drift on where degradation starts. (A second predicate for
  spec-less row paths, `pastRowBudget`, briefly existed but had no call
  sites and disagreed with `overDepthBudget`'s boundary — it has been
  deleted.) `depthTodoLine` is likewise the one production of the TODO
  comment shared by both emitters.

### Fixed

- **Emitted bindings now respect formstand's typed `FieldPath` budget**
  (7 segments when this fix landed; now 9 — see Changed above) (found by
  dogfooding: the DeepBoundaryForm playground demo). The
  walkers happily emitted 9-segment paths (`l1.l2....l8.leaf`) that fail
  typecheck in every consumer (TS2820, `FieldPath<T, D = 7>` in
  `src/core/fieldPath.ts`). The emitters now count segments of the FULL bound
  path — dots split, a template hole (`${index}`, `${p0}`) one segment each,
  so an array level spends TWO — and a binding that would exceed the budget
  degrades exactly like other unsupported shapes: compiling output with a
  `{/* TODO: path ... exceeds formstand's typed FieldPath depth (7); bind by
  hand */}` comment plus a stderr warning per degraded path. Container
  recursion stops at the boundary (an object whose own path is at 7 segments
  can only produce over-budget children), the subtree is still materialized
  in the zod schema and `initialValues`, and paths exactly AT the limit —
  including 7-segment nested-array templates like
  `` `teams.${p0}.members.${p1}.phones.${index}` `` — keep binding
  byte-identically to before. Covers both layouts, all three UIs, and
  recursive nested-array row extraction; this is deliberately NOT a walker
  depth clamp (walk-depth is the wrong proxy for segments — a coarse cap
  would have broken the working 3-level nested-array output).
  Follow-up alignment: an at-budget array whose ITEM is non-scalar (an
  array-of-arrays, or array rows holding a tuple/union) now emits the DEPTH
  todo at the row site instead of the generic extract-a-row advice — which
  was unachievable there, since the row path itself is past the budget —
  and `overBudgetFieldPaths` (the stderr warning list) mirrors the emitted
  TODOs exactly, one entry per TODO site, per-FIELD for an array's object
  rows (the emitters degrade those field by field). The mirror is
  LAYOUT-AWARE (see Fixed below): the walk takes the emitting layout's
  degradation frontier, since the two layouts stop descending at different
  places.
- **`.default()` / `.prefault()` values now land in the generated
  `initialValues`** instead of being ignored (`defaultedNumber: z.number()
  .default(42)` emitted `undefined`, contradicting the README). `fromZod`
  captures the value off the zod def into a new optional `defaultValue` on
  the IR's `SharedSpecProps`, and `emitInitialValues` seeds the field with
  it whenever it is a JSON-serializable primitive matching the field kind
  (string / finite number / boolean / declared enum option). Dates and
  object/array defaults keep the blank behavior. A seeded default satisfies
  `z.input`, so it also counts toward the
  checked-annotation-instead-of-cast decision. Type mode is unchanged — TS
  types can't carry runtime defaults, so `fromType` never sets
  `defaultValue`. The README now states the real rule.
  Capture hardening on review: zod v4's `def.defaultValue` is a GETTER that
  already resolves the user's factory, so the walk only READS it — a
  function-valued result (an older shape storing the factory itself, or a
  factory returning a function) is treated as not capturable rather than
  invoked, which previously executed arbitrary user code at generation
  time (a fixture spy proves the resolved function is never called). The
  getter is read TWICE and the value captured only when both reads
  `Object.is`-agree on a JSON primitive, so a non-deterministic factory
  (`Date.now`, `randomUUID`) can never bake a run-dependent literal into
  byte-deterministic output. And a default is NEVER seeded into a
  todo-fallback spec (`z.custom<T>().default(...)` walks as a string
  stand-in whose kind lies about `T`): seeding there broke the generated
  file's checked `initialValues` annotation — the field keeps its blank
  behavior instead.
- **Walker truncation can no longer ship a non-compiling file, and is never
  silent.** A leaf past the walker nesting budget (11+ segments at default
  flags) degrades to a string-kind stand-in BEFORE its wrappers unwrap, so
  its kind and flags can be wrong (`z.number().nullable()` at 11 segments
  blanked to `""` in a `number | null` slot) — and the checked
  `initialValues` annotation shipped that as a compile error in the
  consumer's tsc. `blankNeedsCast` now treats a REQUIRED todo-bearing leaf
  (truncated specs are always required-flagged; a required `z.custom`
  fallback hits the same rule) as not input-satisfying, forcing the
  `as unknown as` cast so the generated file always compiles — in both
  layouts, which share the one predicate. Optional/nullable fallbacks keep
  the checked annotation (their `undefined`/`null` blanks genuinely satisfy
  `z.input` — those flags only exist when real wrappers unwrapped). And the
  truncation is mirrored on stderr: the walkers stamp a recognizable marker
  todo (`NESTING_LIMIT_TODO`), `truncatedFieldPaths` collects the truncated
  paths, and the CLI prints
  `warning: path "…" exceeds the walker nesting budget (11); field degraded
  to a placeholder — raise --max-depth or bind by hand` per path.
- **Depth warnings no longer promise TODOs the chosen layout never emits.**
  `overBudgetFieldPaths` walked one fixed shape while the two layouts stop
  descending at different frontiers: the single-file layout does not descend
  into array-of-array items (generic extract-a-row TODO, no depth TODO
  inside), and the module layout does not recurse into OBJECT fields of an
  array row (generic bind-by-hand TODO) — so for those shapes the stderr
  warnings claimed depth TODOs that weren't in the file (always
  over-promising, never under-reporting). The walk now takes the emitting
  layout's `DepthWarningFrontier` (`depthWarningFrontier("single" |
  "module")`; the single-file frontier is the default, preserving existing
  programmatic behavior), and `warnDegradedBindings` passes the CLI's
  `--layout`. Tests pin warnings-per-TODO equality for both divergent
  shapes in both layouts.
- **Refused `.default()` captures now warn instead of degrading silently.**
  Every mode that leaves a declared default unseeded is mirrored on stderr:
  the capture guard's refusals (function-valued resolved default,
  non-deterministic two-read disagreement, throwing getter) are recorded on
  the IR as `droppedDefault`, and emit-time refusals (todo-fallback specs,
  kind-mismatched or non-finite values, undeclared enum options, dates,
  container defaults) are detected off the captured `defaultValue` — the
  CLI prints `warning: field "…" has a .default() the CLI could not capture
  (non-primitive, non-deterministic, or degraded field); it starts blank —
  seed it by hand`, one per field. Fields with no default never warn.

## formstand-cli 0.7.0 — 2026-07-12

### Added

- **Tuple support** (`z.tuple([...])` and `[A, B]` in type mode). Tuples were
  degrading to a single string field with a TODO; they now generate fixed
  positional controls, each bound at a static numeric-index path (`coord.0`,
  `coord.1`), in both the single-file and module layouts and all three UIs.
  Scalar elements render a real control; a non-scalar element (object / array /
  union / nested tuple) or a variadic rest degrades to a TODO at just that
  position, so the fixed scalar positions still generate. Generated output is
  typechecked against the real library across all backends.
- **Recursive nested-array extraction in both layouts.** An array nested
  inside an array row used to generate one level (module) or a TODO
  (single-file). It now recurses to arbitrary depth (bounded by `--max-depth`)
  in **both** layouts: `teams[] › members[] › phones[]` generates a full
  component tree, threading each enclosing row's index down as a `p0`, `p1`, …
  prop. In `--layout module` each level is a `Row`/`Rows` pair; in single-file
  each is a child `{Stem}Rows` component with a typed `form` prop, emitted
  above the main component. Array-of-arrays sections extract an inner row
  component too (module). A non-array shape inside a row (nested object /
  union / tuple) still degrades to a TODO. Every generated tree is typechecked
  against the real library across all three UIs.
- `--max-depth <n>` flag (and a `maxDepth` argument on `fromZod` / `fromType`)
  for the schema/type nesting budget — the number of levels the walkers
  descend before a level degrades to a string + TODO. The default rose from 6
  to **10**, so deeper schemas generate fully. Recursion is still caught
  directly by a seen-set (a self-referential schema → TODO), with the depth
  budget as the backstop for getter-minted schemas; the IR is always finite.

### Fixed

- An array whose item is itself non-scalar (an array-of-arrays, or an array of
  tuples/unions) no longer emits an empty `{/* unreachable */}` row in the
  single-file layout — it now emits a clear TODO to extract a row component,
  matching the documented nested-array behavior.

### Docs & examples (no package changes)

- Corrected the CLI README / code-generation guide, which claimed several
  already-resolved limitations: `date` fields have emitted real `DateField` /
  date-input bindings since 0.9 (not a text-input TODO), and the module layout
  extracts one real nested-array row level (not a blanket TODO).
- Schema builder: **paste a zod schema**. An **Import code…** modal takes a
  TypeScript type _or_ a `z.object(...)` schema — by paste or by picking a
  `.ts` file — and generates the form from it. The zod source is evaluated in
  the browser against the bundled zod (the REPL trust model: your own code, in
  your own tab, nothing fetched or sent) and walked by the real `fromZod`, so
  it shares the paste-a-type mode's exact IR → emitters path. Switching the
  dialect swaps in a worked sample while the field is untouched.

## formstand-cli 0.6.2 — 2026-07-10

### Added

- Browser-safe programmatic API via the new `formstand-cli/codegen` subpath.
  Everything downstream of the IR — `fromZod`, every emitter
  (`emitPlainForm` / `emitMuiForm` / `emitShadcnForm` / `emitTemplateForm` /
  `emitModuleForm`, `emitZodSchema` / `emitInitialValues`), `joinModuleFiles`,
  `defineTemplate`, `labelFromName` and the casing helpers — is a pure string
  builder with no `fs`/`path` and no TypeScript compiler, so it bundles for the
  browser (the docs Schema-builder generates forms client-side through it). The
  main `formstand-cli` entry still re-exports all of it and adds the
  Node-oriented `fromType` / `defineConfig`.

## formstand-cli 0.6.1 — 2026-07-10

### Added

- Custom templates (`--template <file>` or `template:` in the config): a
  `defineTemplate({ name, imports, leaf })` module overrides the per-kind
  field rendering for a UI kit formstand doesn't ship (Mantine, Chakra,
  in-house), inheriting the generated form's scaffold — sections, arrays,
  discriminated unions, submit. Each leaf renderer gets a context of
  JS-expression strings (`bind`, `field`, `label`, `options`), and the same
  renderer works both in the generated wrapper component and inside union
  variant blocks. Unlisted kinds fall back to plain. `--layout single`
  only for now; overrides `--ui`.


## 0.9.0 — 2026-07-10

### Fixed

- `validateFields` no longer fabricates a "required" error for a field
  whose required ancestor is `undefined` (the field-scoped fast path parsed
  the leaf against undefined where the full-form parse keys the error at the
  ancestor) — sync and async agreed again. `slotAtPath` now checks the
  container at each step.
- `useVariantField` keeps its type guard for **optional/nullable**
  discriminated unions (a missing `NonNullable` let the nullish member
  collapse `keyof` to `never` and leak every key, including the
  discriminant).
- `devtools` is active only in non-production builds
  (`NODE_ENV !== "production"`), so opting in during development never
  streams a shipped form's state to an end user with the extension.
- `parseDateText` accepts calendar years under 100 (the Date constructor
  maps 0–99 to 1900–1999; the literal year is forced back on).
- `DateField` / `dateInputProps` preserve the existing value's time-of-day,
  so re-picking the same day on a timestamped value is no longer spuriously
  dirty (and changing the day keeps the time).
- `parsePath`'s cached segment array is frozen — it is shared across callers
  now, so external mutation throws instead of corrupting the cache.
- `useVariantField` docs the write-gating contract (gate variant-field
  writes on the discriminant, like rendering).

### Added

- `useVariantField(form, unionPath, field)`: typed access to the
  variant-specific fields of a `z.discriminatedUnion` — the ones
  `FieldPath` omits because they exist in only some union members (the
  discriminant stays a common key, bound with plain `useField`). Typed as
  the field's value across the variants that declare it, widened with
  `| undefined`; a non-variant field or the discriminant itself is a
  compile error. `createFormHooks` gains a bound `use{Name}VariantField`.
- `persistForm(form, { key })`: the autosave recipe as a first-class
  helper — debounced JSON drafts to any `{ getItem, setItem, removeItem }`
  storage, draft auto-apply on start (`adopt` rebases clean, `restore`
  loads dirty, `manual` waits for you), `clear()` that also cancels
  pending writes, and guarded storage access throughout.
- Redux DevTools: `createForm(schema, { devtools: "checkout" })` connects
  the form's store to the extension via zustand's middleware — every write
  named, inspectable, and time-travelable. Off by default and inert
  without the extension.
- Hot-path performance (the 2026-07 review's efficiency findings, no API
  changes): `parsePath` is memoized (every field subscription re-parsed
  its path per store notification); `validateFields` parses just the
  requested subschemas when they're extractable — cross-field rules still
  force the full parse, because extraction bails on refined levels — so a
  wizard step stops paying for the whole schema per click; `diff()`/
  `dirtyFields()` deep-compare each node once instead of once per ancestor
  level; `focusFirstError` runs its focusability DOM walks only on
  name-matched candidates instead of every named control in the document.
- Dates are a first-class field kind: `DateField` (an `<input type="date">`
  bound to Date-typed paths) joins the shipped components, with
  `dateInputProps` / `dateToInputText` / `parseDateText` exported for
  custom markup and UI-kit adapters. Local calendar-date semantics
  throughout (never `toISOString()` — June 1 stays June 1 west of UTC),
  the `emptyValue` round-trip on clear, and rollover rejection
  (`2026-02-31` is invalid, not March 3).

### CI (no package changes)

- Dependabot triage: esbuild pinned to the patched 0.28.1 line via npm
  overrides in the root and cli (dev-server advisories), scoped to spare
  vitepress 1.x's nested vite-5 toolchain (esbuild 0.28 can't downlevel to
  vite 5's browser targets). The remaining vitepress-nested alerts are
  dismissed as tolerable risk — local docs dev/build only — with the
  VitePress 2 migration tracked on the roadmap as the real fix.
- Workflows declare least-privilege GITHUB_TOKEN permissions (CodeQL:
  actions/missing-workflow-permissions).

### Docs & examples (no package changes)

- The Schema builder gains a **Paste a TypeScript type** mode: paste an
  interface or type alias and the same in-browser emitters generate the
  form — no TypeScript compiler in the bundle, a focused ~250-line parser
  covers the CLI's type-mode subset (string/number/boolean/Date, arrays,
  nested objects, string-literal unions, optional/nullable) and degrades
  the rest to a text field with a TODO. Both input modes share one emit
  path.
- ROADMAP.md: a living plan for the library and the CLI — the 0.9/cli-0.6
  cycle (dates as a first-class field kind, hot-path performance,
  DevTools, CLI config + watch), the next tier, the parking lot, and the
  review's deferred cleanup items.
- The theme is one preference across the docs site and the playground:
  the playground stores its light/dark choice under VitePress's own
  localStorage key (same origin), so flipping either surface's toggle
  follows you to the other.
- The demo body caps at a readable 760px measure; legitimately wide demos
  (Perf's grid, the Schema builder, the Invoice table) opt out via an
  explicit WIDE_DEMOS set.
- The demo card gets a real header: group eyebrow, title, a one-line
  description of what each demo shows (exhaustive over the tab keys, like
  the group map), and the View state / View code toggles plus a copy-link
  button as a right-aligned action cluster — shell chrome separated from
  demo content by a hairline. The nav groups show demo counts, and the
  mobile bottom sheet gains its own Close button (the header toggles sit
  behind it).

- Mobile playground shell: a top app bar (menu / title / controls), the
  demo list as an off-canvas drawer that closes on pick, and the View
  state / View code panel as a bottom sheet — all CSS-driven, desktop
  layout unchanged.
- Light theme: a toggle in the app bar (and sidebar on desktop), defaulting
  to the OS preference and persisted per browser. One variable palette in
  styles.css drives the shell; the MUI bridge and the shadcn scope follow
  the same html[data-theme] switch. Terminal/code surfaces deliberately
  stay dark in both themes.
- The GitHub link in the shell shows the repo's star count (best-effort,
  cached per session, skipped under tests).

## formstand-cli 0.6.0 — 2026-07-10

- Discriminated unions (`z.discriminatedUnion`) at a field position: the
  generator emits a discriminant select plus per-variant conditional
  blocks, binding variant fields through the library's `useVariantField`
  (single-file) or bound `use{Name}VariantField` (module layout) — fully
  typed, no casts. All six emit paths (plain/mui/shadcn × single-file/
  module) typecheck against the real helper. Initial values pick the
  first variant; the schema round-trips. Nested-in-section unions,
  unions in array rows, and non-scalar variant fields keep a TODO.
- Nested-array row extraction (`--layout module`): an array inside a
  section object, or an array inside an array row, now generates its own
  Row/Rows component pair with a bound `useFieldArray` on the template
  path (two numeric holes for arrays-in-rows,
  `contacts.${parentIndex}.phones.${index}.number`) instead of a TODO
  comment. One extraction level per array — deeper nesting keeps a TODO.
- `formstand.config.ts` (also `.mts`/`.js`/`.mjs`, or `--config <file>`):
  project defaults for `ui`/`layout`/`sections`/`columns`, written with the
  typed `defineConfig` export. Precedence is flags > config > built-ins,
  and config typos fail as loudly as flag typos.
- `--watch`: regenerate whenever the input file changes (requires
  `--out`; reruns overwrite their own output). Watches the parent
  directory so editors that save via rename don't kill the watcher.
- A kind × optional × nullable matrix test pins `emitInitialValues` and
  `blankNeedsCast` agreement in both directions: the no-cast combos must
  typecheck with the checked annotation, and every cast combo is proven
  to genuinely need it.
- Date fields emit real bindings instead of a text input with a cast and
  a TODO: `DateField` (plain), `muiDateFieldProps` (MUI `type="date"`
  TextField with a floated label), `shadcnDateInputProps` (shadcn Input).
  `DATE_CAST` and the per-backend date TODOs are gone from generated
  output — forms with dates submit successfully out of the box. Requires
  formstand ≥ 0.9 for date fields.

## 0.8.0 — 2026-07-10

#### Fixed (2026-07 full-repo review)

- `valuesEqual` compared only the first object's keys, so two objects with
  equal key counts but different key sets (one holding `undefined`) read as
  equal — dirty flags, `diff()`, and server-error release could all treat a
  real change as clean. Key sets must now match (`Object.hasOwn`), and the
  compare is symmetric.
- `setAtPath` no longer spreads a `Date`/`Map`/`Set`/class instance at an
  intermediate path into a plain object (silently destroying it); the write
  is refused with a console warning, like other unwritable shapes.
- Path reads return own properties only: `getAtPath(values,
  "lookup.constructor")` on a `z.record` is `undefined` instead of leaking
  `Object.prototype` members as field values.
- A throwing `onInvalid` handler now resolves `submit()` with
  `{ kind: "error" }` like a throwing `onValid`, instead of rejecting out of
  a DOM event handler.
- `restore()` no longer resurrects a snapshotted `isSubmitting` — the flag
  reflects live submit passes, so a mid-submit snapshot restored later can't
  disable submit buttons forever (same rule the validation flags already
  followed).
- `SelectField` on a nullable field keeps its empty option visible and
  selectable after a choice, so the field can be cleared back to `null`
  through the UI (the `emptyValue` round-trip `selectProps` always
  supported). Non-nullable fields keep the disabled placeholder.
- `useFieldArray` no longer hands a removed row's id to a row appended in
  the same update (React treated it as a reorder and resurrected the dead
  row's DOM state); the same-index fallback still keeps an edited row's id.
- `useForm` now also warns when the CONTENT of `initialValues` changes after
  mount (the async-fetch pattern with a module-hoisted schema — previously
  silently ignored with no warning at all). Inline literals with identical
  content stay silent.
- Docs: `field-arrays.md` claimed array ops re-key `isValidating`; they
  deliberately drop in-flight flags (the pass that set them is stale) — the
  guide now says so. `components.md` documents the `checkboxProps`
  unchecked-writes-`false` tradeoff for nullable booleans.

### Docs & examples (no package changes)

- The docs nav gains a "Built on" menu and the footer links to
  [zod](https://zod.dev) and [zustand](https://zustand.docs.pmnd.rs).

- A "Schema builder" tab: formstand-gen running in the browser. A formstand
  form describes a schema (fields, sections, arrays, enum options — with
  duplicate-name and enum-needs-options cross-field validation), its values
  map straight onto the CLI's IR, and the REAL emitters (imported from
  cli/src — pure string builders, no Node APIs) regenerate the output files
  on every keystroke, shown in a file tree with copy-file / copy-all. All
  the CLI axes are selects: --ui, --layout, --sections, --columns.
- The Schema builder's "Copy all files" is now "Download .zip" — a
  dependency-free STORE-only zip writer (~50 lines, in the demo's own
  source) bundles the generated files under a folder named for the
  component, exactly the tree `--out` would have written.
- Every demo has a direct link: hash routes like
  `examples/#/schema-builder` (kebab-cased tab keys), synced both ways so
  back/forward and hand-edited URLs work. Hash routing because GitHub Pages
  is static hosting.
- The CLI command builder gains Sections and Field columns selects, and the
  Generated Onboarding tab now showcases `--sections panel --columns 2`
  (still CI-verified as the CLI's untouched output).

- A "CLI command builder" tab: a formstand form (cross-field superRefine,
  conditional fields) whose live-updating formstand-gen command line is
  useFormSelector-derived state, with a copy button.
- A "Generated" playground group whose Onboarding tab is formstand-gen's
  untouched `--layout module --ui mui` output for the Onboarding schema —
  CI regenerates it and fails on drift, so the demo is provably what the
  current CLI emits (scripts/generate-cli-demos.mjs).

- MUI and shadcn variants of the Onboarding feature module (31 demos now):
  same shared schema, option lists, and blank draft as the plain module
  (re-exported, so the three can't drift), each with its own form instance
  and pre-wired hooks — MUI sections are Accordions with dirty/valid chips,
  shadcn sections are collapsible with badges. The CLI generates the same
  architecture from the same schema (`--layout module --ui mui|shadcn`).
- The sidebar demo list is a tree view (x-tree-view): brass group folders,
  form-check leaf icons, brass selection.

- The playground gets a real app layout: grouped demo navigation in a
  sidebar (Core / Patterns / Material UI / shadcn/ui — the group map is
  exhaustive over the tab keys, so an unassigned demo is a compile error),
  a sticky scrollable sidebar from tablet width up, and responsive tiers
  through HD to 4K; on mobile the nav becomes wrapping chips above the
  content. `/guide/` on the docs site now lands on a guide index instead
  of a 404.
- Fixed: clicking a checkbox's label made the field and everything below
  it jump down for a frame and snap back (Chrome's label-forwarded
  activation briefly rendered the checkbox as a padded text-input box —
  reproduced and verified fixed in real Chromium via Playwright). The
  playground's text-input chrome now excludes checkboxes, which also gain
  a brass accent-color and a focus-visible ring.
- View state / View code move to a panel on the demo's right (stacked
  below on narrow screens), toggled by the same two buttons; multi-file
  demos (Onboarding) get a file-tree navigator (@mui/x-tree-view with
  folder/file icons) opening on hooks.ts; the sidebar brand links back to
  the docs and stays pinned while the demo list scrolls.
- The Perf demo registers its form like every other tab, so View state
  works (the shell only mounts the panel while open, so a closed panel
  costs the benchmark nothing — the copy says to close it while running).
  The benchmark writes `field0` instead of the mid-grid field, so the
  change is visible without scrolling.

## formstand-cli 0.5.3 — 2026-07-10

### Fixed

- Emitted string literals escape U+2028/U+2029 (JSON.stringify leaves the
  JS line separators raw — a syntax error for pre-ES2019 parsers of the
  GENERATED file, and CodeQL's js/bad-code-sanitization).

## formstand-cli 0.5.2 — 2026-07-10

#### Fixed (2026-07 full-repo review)

- Digit-leading schema keys ("2fa", "2ndOwners") emitted invalid
  identifiers (`const 2ndOwnersArray`); pascalCase/camelCase results are
  now underscore-prefixed when they'd start with a digit.
- Array-row fields named JS reserved words ("new", "delete") emitted
  reserved-word `const` declarations in module sections; row bindings now
  use an identifier-safe variant (`new_`).
- A field named after the module prefix (field "contact" in ContactForm)
  collided with the bound `useContactField` hook from `hooks.ts` — a
  duplicate declaration plus self-recursion; component names are now
  deduped against the hook names too (`ContactField2`).
- Boolean-only schemas with `--ui mui --layout module` emitted an
  `adapter.ts` using `ChangeEvent` without importing it.
- `--name` is validated as an identifier (reserved words rejected) instead
  of interpolating verbatim into declarations and file names.
- Cross-drive input/`--out` on Windows produced an unresolvable
  `"./D:/..."` import specifier; the CLI now fails loudly at generation
  time.
- zod's `.nonoptional()` unwrapped transparently, letting an inner
  `.optional()` win — the field's checked `initialValues` annotation then
  failed to typecheck; `.nonoptional()` now re-requires the field.
- A field literally named `__proto__` silently vanished from emitted object
  literals (prototype-setter semantics); it's now emitted as a computed key.
- `--sections panel` with `--ui mui` rendered different chrome per
  `--layout` (single-file used `CardHeader`, module used `Typography` in
  `CardContent`); both emitters now share the module shape, the grid
  strings come from one set of helpers instead of six inline copies, and
  `emitInitialValues`/`blankNeedsCast` read one shared blank-value table so
  they can't drift.

## formstand-cli 0.5.1 — 2026-07-09

### Fixed

- Generated `initialValues` (and array empty-item constants) only use the
  `as unknown as` escape hatch when the blank draft genuinely can't
  typecheck (a required number/date/enum starts `undefined`); every other
  schema gets a checked type annotation, so typos in edited initial values
  are compile errors again.
- `--layout module`: the generated `index.ts` now re-exports `./schema` and
  `./types` alongside `./hooks`, so consumers can type submit handlers and
  server code (`ProfileValues`, `profileSchema`) off the module's public
  API instead of deep-importing its files.

## formstand-cli 0.5.0 — 2026-07-09

### Added

- `--sections flat|panel|collapsible` and `--columns 1|2|3`: minimal visual
  layout options, working with both `--layout single` and `--layout module`
  and all three uis. Sections render as flat headings (default, unchanged
  output), bordered panels, or collapsible sections; fields inside each
  section flow into 1–3 evenly spaced columns, with nested sections
  spanning the full row. Each ui speaks its own dialect: inline styles for
  `plain` (`<details>`/`<summary>` when collapsible), `Card`/`Accordion` +
  `sx` grids for `mui`, Tailwind classes (`md:grid-cols-2`,
  `bg-card … shadow-sm`, `<details>`) for `shadcn`. The defaults emit
  byte-identical output to 0.4.0.

## formstand-cli 0.4.0 — 2026-07-09

### Added

- `--layout module` works with `--ui mui` and `--ui shadcn`: kit modules
  get a shared `adapter.ts` / `adapter.tsx` exporting the adapter the
  single-file backends inline, and field/section files import it. The
  emitted prop builders are now generic over the field's value type
  (matching the documented example adapters), because the module layout's
  typed hooks surfaced what the single-file layout's widened hooks masked —
  `UseFieldReturn<string>` wasn't assignable to a monomorphic builder.
  Emitted kit modules are typechecked in CI against the MUI stub and both
  the shadcn stub and the repo's real Radix components.

### Docs & examples (no package changes)

- Brand pass on the docs site and playground: the formstand mark (a form
  with its green check, resting on a music stand) as logo and favicon, a
  brass/ink palette replacing the stock VitePress indigo, hand-drawn SVG
  feature icons replacing the emoji, and restrained motion (hero float,
  card lift, tab/button transitions, demo fade-in) — all disabled under
  prefers-reduced-motion. The playground gains a branded header and
  focus-visible states.

## formstand-cli 0.3.0 — 2026-07-09

### Added

- `--layout module`: emits a feature-module folder instead of one file —
  `schema.ts` (re-exported in zod mode, generated in type mode), `types.ts`,
  `hooks.ts` (`createForm` + `createFormHooks`, so the whole module shares
  one pre-wired hook API), one file per scalar field (props type + field
  hook + component), one file per top-level object/array section (props
  type + section hook built on the path-scoped dirty/valid flags +
  component), the form body, and `index.ts` — the shape of the Onboarding
  playground demo. `--out` names the folder with all destinations
  pre-checked; without it the files stream to stdout with `// --- file:`
  headers. Emitted modules are typechecked in CI against the library
  source, including hostile-name, colliding-name, and leaf-free schemas.
  Requires formstand ≥ 0.7; `--ui plain` only for now.
- `emitModuleForm` / `joinModuleFiles` join the programmatic API.

## 0.7.0 — 2026-07-09

### Added

- `createFormHooks(form, name?)` — every hook pre-wired to one form, the
  provider-free way to share a module-singleton form. The optional name is
  baked into the hook names at the type level and at runtime
  (`createFormHooks(form, "invoice")` → `useInvoiceField`,
  `useInvoiceFieldArray`, `useInvoiceSelector`, `useInvoiceSelectorShallow`,
  `useInvoiceError`, `useInvoiceIsDirty`, `useInvoiceIsValid`,
  `useInvoiceIsSubmitting`, `useInvoiceSubmitCount`), so a typo'd
  destructure is a compile error; omit the name for unprefixed keys. Every
  bound hook keeps its unbound signature minus the `form` argument — typed
  paths, array item inference, path-scoped flags. Documented alongside
  `createFormContext` with the singleton/SSR caveat; new "Hooks factory"
  playground tab.

### Docs & examples (no package changes)

- New "Onboarding" playground tab: a 26-field, five-section feature module
  built on `createFormHooks` — `schema.ts` / `types.ts` / `hooks.ts`, one
  file per field, one per section (section headers run the path-scoped
  `useIsDirty`/`useIsValid` flags), with the whole folder shown in the
  View code panel.
- The playground's View code panel is syntax-highlighted (Prism, ~25KB —
  read-only, so no editor bundle).

## 0.6.0 — 2026-07-09

### Added

- `useIsDirty(form, path?)` and `useIsValid(form, path?)`: an optional
  typed path scopes the flag to a subtree with the library's usual prefix
  semantics (`"shipping"` covers `shipping.city`; for validity the path's
  own key counts, so array-level errors match their array's path).
  Subscriptions stay boolean-only — the component re-renders when the flag
  flips, not on every keystroke like `useField(...).dirty`. Omitting the
  path keeps the whole-form behavior; schema-less `FieldFormApi`-style
  forms take plain string paths.

## formstand-cli 0.2.2 — 2026-07-09

- Generated array hooks drop the explicit item type
  (`useFieldArray(form, "items")`): formstand ≥ 0.5 infers it from the
  schema through the path — and rejects the old explicit spelling on typed
  forms. On formstand 0.4 the generated code still compiles, with untyped
  items.
- Generated shadcn output defines one `ariaInvalid` helper (used by the
  inlined adapters and the select trigger) instead of repeating the ternary
  four times, and the generated `FieldError` computes the message once —
  cosmetic; runtime behavior unchanged. Internally the MUI and shadcn
  backends now share their emitted snippets (error helper, `BoundFieldProps`,
  the leaf switch), so the generators can't drift.

## 0.5.0 — 2026-07-09

### Breaking

- `useFieldArray` infers the item type from a `Form<TSchema>` and a typed
  path — `useFieldArray(form, "users")` (and template paths like
  `` `albums.${index}.tracks` ``) needs no type argument, and `push`/`insert`
  are typed against the schema's item. Consequently the old explicit
  `useFieldArray<TItem>(form, path)` spelling is a **compile error on typed
  forms** (drop the generic); it remains the way to bind schema-less
  `FieldFormApi` forms, where there is nothing to infer from. A non-array
  path types the items as `never`; a typo'd path is rejected against the
  full `FieldPath` union, like `useField`. Path selectors return
  `UseFieldArrayReturn<unknown>` (dynamic paths carry no type), also like
  `useField`.

### Fixed (site only)

- The deployed playground bundled two copies of React (the formstand alias
  reaches outside the examples package, so its imports resolved the repo
  root's copy) — every tab crashed at startup with a null hooks
  dispatcher. The examples build now dedupes react/zustand/zod and CI
  asserts the bundle holds exactly one React.

### Docs & examples (no package changes)

- The playground demos bind shadcn's `Input`/`Textarea` with the library's
  own exported `textInputProps`/`numberInputProps` — the shadcn adapter now
  covers only the Radix dialect, and the "field has an error" predicate
  lives once in `examples/src/fieldErrors.ts` (shared by both adapters).
- The copy-in shadcn kit is trimmed to what the demos render (Badge/Button
  variants, dead peer-disabled label classes) and every component exports a
  `Readonly` props type.

## formstand-cli 0.2.1 — 2026-07-09

### Fixed

- Leaf-free schemas (no scalar fields anywhere, e.g. an object of empty
  objects) no longer generate non-compiling output in the `mui` and
  `shadcn` backends — the emitted `BoundFieldProps` type referenced
  `FieldFormApi` without importing it. All three backends now have a
  leaf-free typecheck test.
- The shadcn backend's generated output is additionally typechecked in CI
  against the repo's real Radix-based components (not just the structural
  stub), so a shadcn/Radix prop-contract change fails our suite instead of
  the consumer's build.

### Docs & examples (no library package changes)

- Playground: the page chrome stylesheet is unlayered again — cascade
  layers can't be transpiled, so pre-15.4 WebKit (the es2019 target's
  audience) was losing every tab's styling; its selectors are class-scoped,
  so the shadcn utilities are unaffected. The layer-order statement now
  pins Tailwind's canonical `components` slot below `utilities`.
- shadcn kit: sliders take an `aria-label` routed to the Radix Thumb (the
  Root is a `<span>`, so `htmlFor`/`id` never named it); radio-group items
  show error styling via `group-aria-invalid` (Radix doesn't propagate the
  Root's `aria-invalid` to items); the Team demo's rows are memoized with
  stable handlers so keystrokes in one row stop re-rendering the rest.
- Publish workflow: `--provenance` is explicit again (fail-closed — the
  automatic path silently skips attestation when conditions aren't met) and
  the Node pin is `>=24.8`, the first line whose bundled npm meets trusted
  publishing's 11.5.1 floor. CI asserts the root and examples lockfiles
  agree on the deduped UI packages, so the smoke test can't silently
  certify a different build than the deployed playground.

## formstand-cli 0.2.0 — 2026-07-08

### Added

- `--ui shadcn`: generates forms against [shadcn/ui](https://ui.shadcn.com/)
  conventions — components imported from the app's `@/components/ui/*` alias
  (what `npx shadcn add` scaffolds), an inlined adapter speaking the Radix
  dialect (`onCheckedChange`/`onValueChange`, dropdown-close as the blur
  trigger), and `aria-invalid` error styling with a message line. Generated
  output is typechecked in CI against the library source and a structural
  stub of the shadcn components, like the other backends.
- `emitShadcnForm` joins the programmatic API.

### Docs & examples (no library package changes)

- Four shadcn/ui playground demos (Signup, Checkout, Settings, Team) plus
  the formstand→shadcn adapter pattern they showcase —
  `examples/src/shadcn/shadcnAdapter.ts` bridges `useField` to both native
  inputs and the Radix-based widgets (Checkbox, Switch, Select, Slider,
  RadioGroup).
- The playground carries its own copy-in shadcn component kit under a
  scoped Tailwind 4 setup (no preflight; the plain-CSS and MUI demos are
  untouched).

## 0.4.1 — 2026-07-08

### Fixed

- `submit`'s stale-write guard now uses pass ownership (cleared by
  `reset`/`adoptValues`) in addition to the values-reference check — a bare
  `reset()` on a pristine form during an in-flight submit no longer gets
  stale errors and touched marks committed (reference equality couldn't see
  it: reset restores the same `initialValues` reference).
- `restore()` no longer resurrects in-flight validation flags captured in a
  snapshot (`isValidating`/`isValidatingForm` are transient, owned by live
  passes — a restored copy could stick forever).
- `focusFirstError`/`focusField` verify focus against the element's own root
  node, fixing a regression that walked past every candidate inside a shadow
  root and reported failure after moving focus to the wrong control.
- `focusField("")` focuses the form's first focusable control (whole-form
  scope, like its imperative siblings), with the same multi-form
  refuse-to-guess rule as `focusFirstError`.
- `field.setError("string")` is normalized to an array before reaching
  `FieldFormApi.setError`, shielding pre-0.4 custom implementations typed
  for `readonly string[]`.

### Internal

- Validation pass ownership uses unique `Symbol()` tokens — collisions after
  `reset`/`adoptValues` are impossible by construction rather than guarded
  by a never-reset counter invariant.
- Publish workflow fails fast when the pushed tag doesn't match
  `package.json`'s version; the CLI release checklist pushes the release
  commit, not just the tag.

## 0.4.0 — 2026-07-08

### Breaking

- The deprecated `useFormState` / `useFormStateShallow` aliases are removed —
  use `useFormSelector` / `useFormSelectorShallow` (renamed in 0.2.0 because
  React DOM ships its own, deprecated, `useFormState`).
- Bound components' `path` prop is schema-typed when `form` is a
  `Form<TSchema>` (`PathsOf<F>`): typo'd paths are now compile errors, and
  runtime-built strings need the documented cast. A structural `FieldFormApi`
  form keeps plain `string`.
- `focusFirstError`'s root-`""` fallback no longer fires under the default
  `document` scope when the page holds more than one `<form>` — "first
  control" would be a guess, so it returns `false`. Pass the form element
  (e.g. via a ref) as `root`.
- `SubmitResult` gained `{ kind: "error", error }`: when `onValid` throws or
  rejects, `submit` now **resolves** with that result instead of rejecting
  (so `handleSubmit` never leaves an unhandled rejection). Code that relied
  on catching the rejection must check `result.kind === "error"`.
- `adoptValues` now clears the in-flight validation flags
  (`isValidating` / `isValidatingForm`) along with the errors it already
  cleared — the rebase disowns in-flight passes.
- `submit` skips its error/touched state writes when the form was rebased
  while validation was in flight: when `values` changed, when `reset` /
  `adoptValues` ran (including a bare `reset()` on a pristine form, where the
  values reference doesn't change), or when a concurrent
  `submit({ force: true })` re-claimed ownership (the LAST submit's writes
  land). `onValid`/`onInvalid` still run and the result still reports the
  outcome.

### Added

- `focusField(path, root?)` — imperative focus by path (the `setFocus` of
  react-hook-form), sharing `focusFirstError`'s focusability rules.
- `emptyValueForSchema(schema)` is exported — the schema-introspection rule
  behind `useField().emptyValue`, alongside its adapter siblings
  `numberToInputText` / `parseNumberText`.
- `field.setError` (from `useField`) accepts a single string, matching
  `form.setError`. The hook normalizes the shorthand to a one-element array
  before forwarding, so custom `FieldFormApi` implementations typed for
  `readonly string[]` never receive a bare string.
- `focusField("")` focuses the first focusable control in scope (the
  whole-form `""` semantics of the imperative surface); under the default
  `document` scope it refuses to guess between multiple `<form>`s, like
  `focusFirstError`'s root-`""` fallback.
- `validateField` / `validateFieldAsync` targeting a path the schema
  provably cannot contain now warn (once per path per form) — protects the
  docs-sanctioned dynamic-path casts from silent always-valid results.
- Docs: a migrating-from-react-hook-form guide with the full API mapping
  table.

### Fixed

- Array ops no longer strand in-flight `isValidating` flags: flags under the
  path are dropped rather than re-keyed (the completing pass clears the
  original key, so a re-keyed flag could never be cleared).
- In-flight validation passes are owned via unique symbol tokens (unique by
  construction), so a superseded pre-reset validation pass can never collide
  with a post-reset one and clobber its state.
- `restore(snapshot)` clears the transient in-flight flags (`isValidating` /
  `isValidatingForm`) instead of restoring them — in-flight state is owned
  by live passes, never by snapshots, so a restored flag would stick forever.
- `focusFirstError` / `focusField` verify focus against the element's own
  root (`getRootNode().activeElement`), so controls inside a shadow root are
  no longer reported as unfocused (`document.activeElement` retargets to the
  shadow host).
- `validateFieldAsync("")` delegates to the whole-form pass, so its pending
  state lives in `isValidatingForm` instead of `isValidating[""]`.
- `focusFirstError` / `focusField` report success only when a control
  actually **holds** focus — hidden, disabled, closed-`<dialog>`, and
  focus-refusing matches are passed over for the next candidate in DOM
  order.
- `dirtyFields()` / `diff()` report an object that diverges only by an
  `undefined`-valued key, agreeing with `useIsDirty`.
- `SelectField` tolerates duplicate option values (React keys no longer
  collide).
- `useField` typo errors blame the path argument against the full
  `FieldPath` union instead of blaming the form argument.

## 0.3.0 — 2026-07-04

### Added

- `numberToInputText`, `parseNumberText` (and the `ParsedNumberText` type)
  are exported — the number-text rules the built-in bindings use, so
  adapters for third-party UI kits can share them instead of re-deriving.
  This is the minimum formstand version for `formstand-gen --ui mui` output.

### Docs & examples (no package changes)

- Five Material UI 9 playground demos plus the ~60-line formstand→MUI
  adapter pattern they showcase.
- `formstand-cli` (`formstand-gen`) lives in the repo: generates form
  components from a zod schema or TypeScript type. Published separately.

## 0.2.0 — 2026-07-02

The result of a full-repo review pass (37 items across correctness, API
gaps, robustness, testing, tooling, and docs — the working log lived in
`TODO.md`, retired after release; see the git history for the play-by-play).

### Breaking

- The package is named **formstand** (`zustand-forms` is taken on npm) —
  update imports accordingly.
- Errors are split into two stored channels: `FormState.schemaErrors`
  (validation-owned, rebuilt every pass) and `FormState.serverErrors`
  (app-owned via `setError`/`setErrors`, invisible to validation).
  `FormState.errors` remains the map hooks read but is now derived from the
  channels (schema wins at a key, server shows where the schema is silent) —
  patch the channels through `updateState` (its patch type omits `errors`),
  not `errors`. Consequences: `setErrors` replaces only the server channel
  (schema errors persist until the next pass), and `restore` re-derives the
  merged map from the snapshot's channels — snapshots persisted under an
  older state shape lose their error state on restore.
- `FormState.dirty` is removed; dirtiness is derived from `values` vs
  `initialValues` everywhere (`useField().dirty`, `useIsDirty`,
  `dirtyFields()`, `diff()`).
- `submit` resolves a discriminated `SubmitResult` — `{ kind: "valid", data }`,
  `{ kind: "invalid", errors }`, or `{ kind: "skipped" }` — instead of a
  ran/skipped boolean.
- The imperative write surface is typed: `setValue`, `setTouched`, `setError`,
  `clearErrors`, `validateField(s)`, and the array ops take `FieldPath`-typed
  paths (and value types are checked). Runtime-built path strings need a cast.
- Sync `validate` / `validateField` / `validateFields` no longer throw on
  async schemas; they start the async pass and return a
  `{ kind: "pending", promise }` result (`validateFields` returns the
  `Promise<boolean>` itself).
- Whole-form async validation state moved from the `"__form__"` key in
  `isValidating` to a dedicated `FormState.isValidatingForm` boolean.
- `useFormState` / `useFormStateShallow` are renamed to `useFormSelector` /
  `useFormSelectorShallow` (old names remain as deprecated aliases).
- `SelectProps` is no longer generic; `NumberFieldProps` drops the unused
  `step` prop; `UseFieldReturn` gains a `path` property.

### Fixed

- Array ops and `setValues` now update the dirty map (`useIsDirty`, `diff()`,
  `dirtyFields()` were blind to them).
- Field-level validation parses just the field's subschema when possible (no
  more firing every async refine in the form on unrelated keystrokes) and
  writes/clears errors by path prefix.
- Manual/server errors set via `setError` survive full-form validation passes
  the schema is silent on.
- Zod `invalid_union` branch issues are flattened to field-level paths.
- `SelectField` stays controlled while the value is `undefined`.
- `useFieldArray` id reconciliation is concurrent-render-safe (derived state
  instead of render-phase ref mutation) and keyed on form + path.
- Failed submits mark errored fields touched; `NumberField` rejects
  `Infinity`, treats whitespace as empty, and reflects external writes while
  focused; Dates compare by timestamp in dirty tracking; array ops validate
  indices; error arrays keep reference identity across passes; paths respect
  the existing container (records with numeric keys are no longer arrayified).

### Added

- Accessibility wiring on all bound components (`name`, `aria-invalid`,
  `aria-describedby`, `role="alert"`) and `ref` support; `focusFirstError`.
- `reset(nextInitial, { keepErrors, keepTouched, keepSubmitCount })` (no
  `keepDirty` — dirtiness is derived from values vs `initialValues`, which
  reset makes equal), `resetField(path)`, `getFieldState(path)`, `SelectField` `placeholder`,
  `setError` accepts a single string, `"onTouched"` / `"all"` validation
  modes, and `FieldPath` support for optional/nullable object levels.
- `useForm` warns once when the schema reference changes after mount.

### Internal

- CI workflow (typecheck + lint + test + build), ESLint flat config with
  typescript-eslint and eslint-plugin-react-hooks, vitest 4 + jsdom 29,
  V8 coverage (`npm run test:coverage`), Testing Library auto-cleanup via a
  vitest setup file, fake-timer debounce tests, StrictMode coverage, and
  publish metadata (`repository`, `author`, `engines`, split `types`
  conditions for ESM/CJS).

## 0.1.0

Initial release.
