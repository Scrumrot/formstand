# Roadmap

A living plan for **formstand** (the library) and **formstand-cli** (the
generator), ordered by intent, not promise. Items move between horizons as
reality votes. Shipped work graduates to the [CHANGELOG](./CHANGELOG.md).

_Last updated: 2026-07-10 (formstand 0.9.0, formstand-cli 0.6.0)._

## Shipped — 0.9 / cli 0.6 (2026-07-10)

The whole "Now" tier plus the entire promoted parking lot landed in this
cycle, followed by a full self-review that found and fixed ten real bugs.
See the [CHANGELOG](./CHANGELOG.md) for detail.

- **Dates as a first-class field kind** (library + CLI) — `DateField` /
  `dateInputProps` / `dateToInputText` / `parseDateText`; the CLI emits real
  date bindings, `DATE_CAST` gone.
- **Discriminated unions**, done the right way after the design fork:
  `useVariantField` in the library (typed variant-field access) first, then
  the CLI emitting against it — no casts.
- **`persistForm`** — the autosave recipe as a first-class helper.
- **Redux DevTools** — opt-in, non-production only.
- **Hot-path performance** — `parsePath` cache, subschema-scoped
  `validateFields`, single-pass `dirtyPathsOf`, focused `focusFirstError`.
- **CLI**: `formstand.config.ts` + `defineConfig`, `--watch`, nested-array
  row extraction, the blank-value matrix test.
- **Playground/docs**: Playwright e2e job (built-bundle, in CI) + render
  checks, SSR/Next.js guide, the Schema builder's paste-a-TypeScript-type
  mode.
- **Self-review fixes**: ten findings (validateFields sync/async divergence,
  optional-union type inversion, three union-emitter compile bugs, devtools
  in prod, date year/time edges, frozen parsePath cache) — all with
  regression coverage.

## Now

- **Custom templates for the CLI.** The escape hatch for UI kits we'll never
  ship (Mantine, Chakra, in-house design systems): a template directory that
  overrides the emitters' leaf/section/adapter snippets per kind. Sequenced
  after config-file support (now shipped) — templates wanted a config home.
- **Publish the emitters for reuse.** The playground imports `cli/src`
  relatively — fine inside the repo, unavailable to anyone else. Either a
  browser-safe subpath export from `formstand-cli` or a small
  `formstand-codegen` package (`ir`, `fromZod`, emitters — everything
  that's already pure). The paste-TS parser proved the browser path works;
  packaging it is the natural next step.
- **Schema builder: paste-zod mode.** A tab that evaluates a pasted
  `z.object(...)` source (the user's own code in their own tab, bundled zod)
  and feeds the same IR → emitters path. Complements the shipped
  paste-a-TS-type mode for "I already have a zod schema" visitors.
- **StackBlitz links.** "Open in StackBlitz" from docs examples and
  playground tabs, seeded with the demo source + formstand from npm.
- **Brand collateral.** OG images for docs/playground pages and a README
  header — the identity exists; it just doesn't travel yet.
- **VitePress 2 migration.** The docs run VitePress 1.x, whose nested vite-5
  toolchain carries dismissed Dependabot alerts (local dev/build only — the
  deployed site is static). v2 alpha ships vite 8, but a first attempt
  rendered our custom theme blank (builds fine, no console errors —
  theme/CSS API changes to chase). Migrate when v2 stabilizes; the alerts
  then close themselves.

## Later / parking lot

- **Visual regression snapshots** for the playground — now actionable on top
  of the shipped Playwright e2e job (baseline images + pixel-diff, vs today's
  render-integrity assertions).
- **Field-level async coordination** — a documented pattern (or helper) for
  forms with several independent async validators in flight; the pieces
  exist, the ergonomics could be sharper.

## Internal debt

Cleanup items verified real but outranked by correctness fixes at the time.
Fair game for any slow afternoon; none block features.

From the 2026-07 review of the 0.8 work:

- `validateFields` / `validateFieldsAsync` / `commitFieldErrors` share one
  commit helper (the server-error release contract lives in 3 places).
- `SectionPlan` carries its leaf `FieldPlan`s so `objectSectionFile` stops
  re-walking and string-matching what `buildPlan` already computed.
- `KindUsage`'s five booleans become a `ReadonlySet<kind>`.
- `camelJoin` delegates to `casing.camelCase`; the plain-UI kind→builder
  mapping in `moduleLayout` gets one `plainBuilderName` helper; the Schema
  builder's name-stem rule reuses `namingFor`.
- `FieldPathArg` is exported but unused — substitute it at the inline sites
  or drop it.
- Schema builder polish: `React.memo` the row components, `useDeferredValue`
  the emission input so typing never waits on codegen.

From the 0.9 self-review (cleanup that outranked the ten correctness fixes):

- `useVariantField`'s return type re-derives what `FieldValue` already
  computes — reuse `FieldValue<..., \`${P}.${TField}\`>` and keep
  `UnionValueAt` only for the key constraint.
- `persistForm`'s `manual` + `restore`-semantics combination is unreachable
  (the apply mode collapses two orthogonal axes); a `{ autoApply, baseline }`
  shape would cover all four without a breaking change.
- The `parsePath` cache clears wholesale on overflow — an LRU (or per-form
  cache at the hook layer) would avoid re-parse storms for apps whose live
  path set exceeds the cap.
- `persistForm` and `useField` each hand-roll a trailing-edge debounce — one
  shared `createDebouncer(fn, ms)` could back both.

## How releases happen

Features land on `main` behind green CI (typecheck, lint, coverage-gated
tests, both builds, the single-React, generated-demo-freshness, and
built-bundle e2e guards), docs/playground deploy on every push, and npm
releases cut from tags via trusted publishing with provenance. "Docs &
examples" work ships continuously; package versions move when `src/` or
`cli/src` does.
