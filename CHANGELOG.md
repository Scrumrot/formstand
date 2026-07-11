# Changelog

## Unreleased

### formstand-cli

#### Added

- **Recursive nested-array extraction** in the module layout. An array nested
  inside an array row used to generate one level of `Row`/`Rows` components and
  a TODO beyond that. It now recurses to arbitrary depth (bounded by
  `--max-depth`): `teams[] › members[] › phones[]` generates a full component
  tree, threading each enclosing row's index down as a `p0`, `p1`, … prop.
  Array-of-arrays sections extract an inner row component too. A non-array
  shape inside a row (nested object / union / tuple) still degrades to a TODO.
  Every generated tree is typechecked against the real library. (The
  single-file layout still TODOs nested arrays.)
- `--max-depth <n>` flag (and a `maxDepth` argument on `fromZod` / `fromType`)
  for the schema/type nesting budget — the number of levels the walkers
  descend before a level degrades to a string + TODO. The default rose from 6
  to **10**, so deeper schemas generate fully. Recursion is still caught
  directly by a seen-set (a self-referential schema → TODO), with the depth
  budget as the backstop for getter-minted schemas; the IR is always finite.

#### Fixed

- An array whose item is itself non-scalar (an array-of-arrays, or an array of
  tuples/unions) no longer emits an empty `{/* unreachable */}` row in the
  single-file layout — it now emits a clear TODO to extract a row component,
  matching the documented nested-array behavior.

#### Added

- **Tuple support** (`z.tuple([...])` and `[A, B]` in type mode). Tuples were
  degrading to a single string field with a TODO; they now generate fixed
  positional controls, each bound at a static numeric-index path (`coord.0`,
  `coord.1`), in both the single-file and module layouts and all three UIs.
  Scalar elements render a real control; a non-scalar element (object / array /
  union / nested tuple) or a variadic rest degrades to a TODO at just that
  position, so the fixed scalar positions still generate. Generated output is
  typechecked against the real library across all backends.

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
