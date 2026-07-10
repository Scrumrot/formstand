# Roadmap

A living plan for **formstand** (the library) and **formstand-cli** (the
generator), ordered by intent, not promise. Items move between horizons as
reality votes. Shipped work graduates to the [CHANGELOG](./CHANGELOG.md).

_Last updated: 2026-07-10 (formstand 0.8.0, formstand-cli 0.5.2)._

## Now — the 0.9 / cli 0.6 cycle

### Dates become a first-class field kind (library + CLI together)

The biggest DX gap and the one place generated code ships a known wart.
Today a `z.date()` field binds as plain text through an
`as unknown as UseFieldReturn<string>` cast with a TODO comment.

- Library: `dateInputProps` / `DateField` beside the number helpers —
  `Date ⇄ "yyyy-MM-dd"` for `<input type="date">`, with the same
  `emptyValue` round-trip the other builders honor (nullable → `null`).
- CLI: emit the real binding and delete `DATE_CAST` at its three sites,
  plus the per-backend date-TODO wording. Generated forms with dates
  submit successfully out of the box.
- Docs: a date-field guide covering the plain input, MUI X pickers, and
  shadcn's Calendar as adapter recipes.

### Hot-path performance (from the 2026-07 review's efficiency findings)

Measurable on the Perf tab's 200-field form; none of these change API.

- Cache `parsePath` (a module-level `Map<string, readonly PathSegment[]>`
  — form paths are a small fixed set, and today every subscriber re-parses
  on every store notification).
- `validateFields` takes the cached-subschema fast path when every
  requested path is extractable, instead of parsing the full schema per
  wizard step.
- `dirtyPathsOf` becomes one recursion (child verdicts derive the parent's)
  instead of re-deep-comparing every subtree per ancestor level.
- `focusFirstError` filters by name match before running focusability
  checks on every named control in the document.

### DevTools integration

zustand already speaks Redux DevTools — expose it: an opt-in
(`createForm(schema, { devtools: "checkout" })`) wiring the store through
the devtools middleware so form state, writes, and time-travel show up
named in the extension. Small surface, big debugging win, zero cost when
off.

### CLI: config file and watch mode

Flag strings are getting long (`--ui mui --layout module --sections panel
--columns 2 --name ...`).

- `formstand.config.ts` (loaded via the existing jiti path) holding
  defaults per project; flags still win.
- `--watch`: regenerate on schema-file change — pairs naturally with the
  module layout during schema-first development.

### CLI: pin the blank-value matrix

A `kind × optional × nullable` table test asserting `emitInitialValues`
and `blankNeedsCast` agree for every combination (the review found the
pairing is only covered indirectly today). Cheap insurance on the one seam
that ships as a compile error in USER code when it drifts.

## Next

- **Playwright suite in CI.** The ad-hoc real-browser checks (mobile
  drawer, theme persistence, bottom sheet, viewport pinning) keep proving
  themselves — formalize them as an `examples` e2e job against the built
  bundle. The dependency is already installed; the deployed-artifact class
  of bug (dual-React) is exactly what jsdom can't see.
- **Schema builder: paste-zod mode.** A second input tab that evaluates a
  pasted `z.object(...)` source (user's own code in their own tab, bundled
  zod) and feeds the same IR → emitters path. The builder form stays the
  default; this serves "I already have a schema" visitors.
- **Custom templates for the CLI.** The escape hatch for UI kits we'll
  never ship (Mantine, Chakra, in-house design systems): a template
  directory that overrides the emitters' leaf/section/adapter snippets per
  kind. This is deliberately AFTER config-file support — templates want a
  config home.
- **Publish the emitters for reuse.** The playground imports `cli/src`
  relatively — fine inside the repo, unavailable to anyone else. Either a
  browser-safe subpath export from `formstand-cli` or a small
  `formstand-codegen` package (`ir`, `fromZod`, emitters — everything
  that's already pure).
- **StackBlitz links.** "Open in StackBlitz" from docs examples and
  playground tabs, seeded with the demo source + formstand from npm.
- **Brand collateral.** OG images for docs/playground pages and a README
  header — the identity exists; it just doesn't travel yet.
- **VitePress 2 migration.** The docs run VitePress 1.x, whose nested
  vite-5 toolchain carries dismissed Dependabot alerts (local dev/build
  only — the deployed site is static). v2 alpha ships vite 8, but a first
  attempt rendered our custom theme blank (builds fine, no console
  errors — theme/CSS API changes to chase). Migrate when v2 stabilizes,
  then un-dismiss nothing: the alerts close themselves.

## Later / parking lot

- **Type mode in the browser** — the TS compiler runs in browsers, but the
  virtual-FS setup and a ~2 MB lazy chunk make this disproportionate until
  someone actually asks for paste-a-TS-interface.
- **Discriminated unions** — `z.discriminatedUnion` as first-class IR:
  library-side narrow-on-discriminant helpers, CLI-side conditional
  sections. Big; needs a design round of its own.
- **Nested-array row extraction in the CLI** — the current TODO comment
  becomes a generated row component with its own `useFieldArray`.
- **Persistence helper** — the autosave recipe (watchValues +
  localStorage + adoptValues) is proven; consider a first-class
  `persistForm(form, storage)` once a second real use case shows up.
- **Visual regression snapshots** for the playground (builds on the
  Playwright job).
- **SSR/Next.js guide** — the createFormHooks singleton caveat deserves a
  worked per-request pattern.

## Internal debt (confirmed in the 2026-07 review, deliberately deferred)

Cleanup items verified real but outranked by correctness fixes at the
time. Fair game for any slow afternoon; none block features.

- `validateFields` / `validateFieldsAsync` / `commitFieldErrors` share one
  commit helper (the server-error release contract lives in 3 places).
- `SectionPlan` carries its leaf `FieldPlan`s so `objectSectionFile` stops
  re-walking and string-matching what `buildPlan` already computed.
- `KindUsage`'s five booleans become a `ReadonlySet<kind>`.
- `camelJoin` delegates to `casing.camelCase`; the plain-UI kind→builder
  mapping in `moduleLayout` gets one `plainBuilderName` helper; the Schema
  builder's name-stem rule reuses `namingFor`.
- `FieldPathArg` is exported but unused — substitute it at the inline
  sites or drop it.
- Schema builder polish: `React.memo` the row components,
  `useDeferredValue` the emission input so typing never waits on codegen.

## How releases happen

Features land on `main` behind green CI (typecheck, lint, coverage-gated
tests, both builds, the single-React and generated-demo-freshness guards),
docs/playground deploy on every push, and npm releases cut from tags via
trusted publishing with provenance. "Docs & examples" work ships
continuously; package versions move when `src/` or `cli/src` does.
