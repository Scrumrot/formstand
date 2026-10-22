# Roadmap

A living plan for **formstand** (the library) and **formstand-cli** (the
generator), ordered by intent, not promise. Items move between horizons as
reality votes. Shipped work graduates to the [CHANGELOG](./CHANGELOG.md).

_Last updated: 2026-10-22 (formstand 0.23.0, formstand-cli 0.24.0)._

## Shipped since 0.9 (2026-07-10 to 2026-07-31)

Four library releases and five CLI releases. The [CHANGELOG](./CHANGELOG.md)
has the detail; the arc was: finish the library's introspection surface, take
the CLI from two UI targets to six, and make the docs match.

**Library, 0.10 through 0.13**

- `useFormValues(form)` for whole-values subscription in render.
- `focusField(path)`, the imperative sibling of `focusFirstError`, plus an
  `[id=path]` fallback so composite widgets that render no `name` (antd's
  `Select`) are still reachable.
- `useNumberInput`, the text-preserving number binding behind `NumberField`,
  exported for UI-kit adapters.
- Explicit type arguments on a schema-typed form now fail with a readable
  message instead of silently selecting the schema-less overload.
- `useFieldArray` ops revalidate the array path under the validation gate, so
  `min`/`max` errors stay live as rows change.
- A no-op `setValue` is a true no-op, so reference identity tracks real
  changes and two-way sync can rely on it.

**CLI, 0.7 through 0.10.1**

- Three new UI targets: Chakra 3, Mantine 9, Ant Design 6, joining plain,
  MUI (5/6/7/9) and shadcn. Six in total.
- The version matrix (`cli/matrix/`): every supported kit major installed side
  by side and typechecked against freshly generated output, both layouts, all
  section styles, under `exactOptionalPropertyTypes`.
- `--live` (no submit scaffold, values subscription) and `--form-prop` (the
  page owns the form instance).
- Per-field component overrides in `formstand.config.ts`, with autocomplete as
  the first flavor.
- zod `.describe()` / `.meta({ description })` and type-mode JSDoc become
  helper text, in every kit's own slot.
- A polynomial-ReDoS fix in the template-hole regex (CodeQL, 0.10.1).

**Docs, playground, and repo**

- The guide and API reference merged into one `/documentation/` route with
  collapsible sidebar groups, and formstand-cli promoted to its own eight-page
  section.
- READMEs deduped against the docs site, and a CI check that fails on a dead
  internal link or anchor across `docs/` and both READMEs.
- The playground's forms reflow on mobile (the library's own `.zf-field`
  markup was never styled, so bound inputs never resized at any viewport).
- Schema builder paste-zod mode: paste a `z.object(...)` and it is evaluated
  in the browser against the bundled zod, complementing paste-a-TS-type.

**Since then (0.14 onward, formstand-cli 0.13.0 onward; the CHANGELOG has the full list)**

- `formstand/devtools` (0.14.0): an in-page panel with per-field rows, both
  error channels shown separately, a live `diff()`, and snapshot/restore.
- `persistForm` hardening (0.15.0): a shape guard that discards drafts whose
  stored shape conflicts with the current schema, and an opt-in `version` so
  schema migrations can invalidate old drafts deliberately.
- Responsive `--columns` and kit-native containers (formstand-cli 0.11.0,
  republished as 0.11.1 after the August 6 GitHub Actions outage dropped the
  tag events): multi-column output collapses to one column on a phone in
  every backend; antd, Mantine, and MUI sections lay out with their kit's
  own Row/Col, Grid/Grid.Col, and Grid components; and the review's four
  edge-config bugs shipped fixed, with tuple-only and root-union schemas in
  the matrix so that class cannot recur.
- Per-field layout placement, phase 2 (formstand-cli 0.12.0): `span` in the
  config `fields` block places a field in its section's grid ("full" or a
  column count), emitted in each backend's own dialect through the
  `Backend.gridChild`/`spanCellFor` seam the container migration prepared.
  Placements with no grid to act on are loud generation-time errors.
- The CLI wizard (formstand-cli 0.12.0): `formstand-gen --wizard` asks the
  flag questions one at a time and ends by printing the composed command, so
  the run is reproducible without it. Both roadmap constraints held: strictly
  opt-in (the flag runs alone, never a TTY sniff, prompts on stderr so
  stdout output stays pipeable), and zero new dependencies: numbered
  readline lists over a hand-rolled buffer, no prompts library.
- JSON Schema and OpenAPI inputs (formstand-cli 0.13.0): the third front-end
  into the IR. A `.json` input reads as a 2020-12 schema or an OpenAPI 3.x
  document, `--schema` selects by component name or `#/...` pointer, and
  the zod schema is generated beside the component the way type mode
  already does. The roadmap's fidelity questions resolved as: `allOf`
  merges object branches, discriminated `oneOf` becomes the IR union,
  string-const `oneOf` becomes an enum, both nullable dialects are honored
  wherever they appear (no dialect flag), date formats become date fields,
  and the rest degrades to the loud TODO fallback. YAML stays out to keep
  the zero-dependency stance; the error names the conversion.
- Generated tests (formstand-cli, 2026-09-18, enriched 2026-09-22): `--tests
  vitest|jest|playwright` emits a spec beside the component from the same
  schema walk, with store-level cases on `formstand/testing`, label-driven
  render cases through the config's `renderWrapper`, and a Playwright spec
  gated on a configured base URL (design and decisions:
  [cli/design/generated-tests.md](./cli/design/generated-tests.md)). The IR
  carries string/array length bounds and number bounds from both the zod
  and JSON Schema front-ends, the emitted schema round-trips them, and the
  spec gains bound and array-minimum cases. Assertions stay
  presence-shaped (the IR carries no authored messages).
- StackBlitz links (2026-09-18): every self-contained playground demo has an
  "Open in StackBlitz" button (the docs examples page reuses the same seed
  builder in its details blocks): a fresh Vite + React project with the
  demo's harness-stripped source plus formstand from npm. Kit demos stay
  gated, honestly: they import sibling adapters that are not part of their
  displayed file set.
- Brand collateral (2026-09-18): OG images for the docs and the playground
  (1200x630, rendered from `scripts/generate-og-images.mjs` so the template
  regenerates them), og/twitter meta wiring on both sites, a self-contained
  banner.svg served from docs/public, and the README header rebuilt around
  it (banner + centered badges).
- `--path-depth N` (formstand-cli 0.22.0, 2026-09-23): the typed-path budget
  as a per-run value threaded through both layouts, the warnings, the
  override validator, and the generated tests; the emitted form sets
  `createForm`'s `pathDepth` to the same number so the library's union
  matches.
- After the roadmap rewrite (2026-10-22, unreleased): the playground's
  Devtools tab, with `FormstandDevtools` gaining an `enabled` override for a
  page whose purpose is showing the state; the "Several async checks at
  once" recipe with the Async demo as its working example (a second async
  field, a form-level `useIsValidating` line, a gated submit); and gzip
  bundle budgets in CI over the library's three entries and the
  playground's main chunk and stylesheet (`scripts/check-bundle-size.mjs`);
  the Standard Schema decision (zod only through 1.0) stated on the docs'
  first page; and "Adding a UI kit", the contributor's checklist for a
  seventh `--ui` backend, from `parseUiTarget` to the matrix job, with the
  antd backend as the reference at every step; and the React Native
  statement in the SSR guide, backed by a CI typecheck of the core and the
  hooks with no DOM lib against a declaration of the only host globals they
  use (`scripts/nodom/host-globals.d.ts`), rather than by an Expo project.
- The starter template (2026-10-22): `templates/vite-react`, a copyable Vite
  + React app with one schema-driven form on the bound components and
  formstand-cli wired in (`npm run generate`), reached with one `npx degit`
  line from getting started and the README. Decided as a folder in this
  repo rather than a `create-formstand` package or a template repository:
  nothing to version or keep in step, CI installs and builds it against the
  published packages on every push, and the suite renders its form against
  the source. A Next.js variant is the `examples/next` item below.
- The CLI's agent surface (formstand-cli, unreleased): `--json` prints one
  document describing the run (every produced file with its text and
  whether it was written, the warnings as notes, the error on failure) and
  `--manifest` prints the generator as data derived from the parser's own
  constants. Decided as the split the roadmap asked for: the generator
  describes itself and its runs here, where the flags live; the MCP server
  that wraps generators as tools belongs to generators-for-ai, which
  already treats formstand-cli as its forms generator.
- The October review (formstand 0.22.0 and 0.22.1, formstand-cli 0.23.0 and
  0.24.0): two read-only review passes over both packages, the docs and the
  playground, then fix rounds in order. Library: quadratic `flattenIssues`,
  prototype-named error keys, async verdicts dropped by unrelated edits,
  fail-closed devtools gates, array ops and `useFieldArray` restricted to
  array paths, nested row ids re-seated across outer reorders, the schema
  deciding what container an absent slot gets, number-keyed record paths,
  and `useFieldArray` parity with `useField`. CLI: degraded leaves compile
  under by-value path typing, line-comment injection closed, specs skip
  unmodeled checks, `fromType` recursion guard, OpenAPI 3.0 nullable and
  `$ref`/`allOf` fidelity. Playground: every demo a lazy chunk (main bundle
  2.95 MB to 381 kB), accessibility wiring on every hand-rolled demo through
  one shared helper, coverage thresholds raised to within three points of
  measured.

## Now

- **VitePress 2 migration, and the vite 5 alerts under VitePress 1.** The
  `chore/vitepress-2` branch built and rendered the full site on
  2.0.0-alpha.18; upstream is at alpha.20 with no beta, and the branch is now
  far enough behind main that it will be rebuilt rather than rebased. New
  since October 22: GitHub reports three Dependabot alerts (one high, two
  medium) on vite 5.4 under VitePress 1, all in launch-editor, the dev
  server's open-in-editor hook. Vite 5 has no patched release and VitePress
  1 pins `^5.4`. The exposure is `docs:dev` on a maintainer's machine, never
  the deployed site or any user, so the decision is to wait for a VitePress
  2 beta and rebuild the migration then. An npm `overrides` entry forcing
  vite 6 under VitePress 1 is the fallback if the alerts outlive the wait.

## Toward 1.0

Where this stands: 0.18.0 (2026-09-17) was declared the last release with
breaking changes before 1.0, with 1.0 to follow one dogfood cycle of the
aviation twin app. Since then 0.19 through 0.22 each carried `### Changed`
entries (array ops take array paths only, bound components type their
`path` by value, `persistForm`'s apply mode respelled). They were corrections
the reviews demanded rather than redesigns, but they mean the soak has not
started. 1.0 is cut when all of the following hold, in this order:

- **One full release cycle with no `### Changed` or `### Breaking` entry in
  either package.** `### Added` and `### Fixed` are fine. The cycle started
  with 0.23.0 (2026-10-22: the `useFieldArray` parity additions and the
  schema-decided container rule) and counts once the twin app has
  upgraded to it.
- **A public API freeze list, written down.** Which exports are the contract
  and which are internal: `createForm` and the `Form` surface, the hooks and
  their return shapes, the bound components and prop builders, the
  `FieldFormApi`/`FieldArrayFormApi` structural contracts (including the
  rule that new members on them are optional and probed before use),
  `formstand/testing`, `formstand/devtools`, the CLI flags, the
  `formstand.config.ts` shape, and the `formstand-cli/codegen` IR and
  emitters. Everything else is internal and may move in a minor. The list
  lives in the docs, not only here.
- **Error message ownership and localization, documented.** Today zod's raw
  messages reach the UI unless the schema carries human text (the generated
  kitchen-sink demo had to add them). The docs need one page that says where
  messages belong (the schema), how to customize them for a whole app (zod's
  error map hooks), how a translated app keys messages (stable codes in the
  schema, text looked up at render), and what the CLI emits by default. This
  is a 1.0-grade question because the answer decides whether `ErrorMap`
  carries strings or something richer.
- **A deprecation policy** (see "How releases happen" below). Needed before
  1.0 so the `zf-` prefix question, or any 1.x removal, has a known path.
- **The stability statement.** 1.0.0 is the soaked minor plus a version
  number and a statement of what semver means for this project; both
  packages go to 1.0 together.

Decided on the way (2026-10-22): **formstand stays zod only through 1.0.**
A Standard Schema adapter would cover validation for Valibot and ArkType
users, but the typed paths, the introspection (`emptyValue`, `clearable`,
container creation), the field-scoped fast path and the generator all read
zod's own schema tree, so such forms would keep validation and lose the
rest, and two tiers of forms with different guarantees is the worse
library. The docs' introduction says so on the first page. What would
reopen it: a Standard Schema revision that exposes the schema tree
(object shape, array element, optional and nullable wrappers) in a
library-neutral way, or a second schema library overtaking zod among the
people who ask for formstand.

## Later / parking lot

- **A Next.js app example with server actions end to end.** The Actions demo
  and the [SSR guide](./docs/documentation/ssr.md) cover the pieces, but
  nothing shows a real route with `"use server"` re-validation, which the
  [security notes](./docs/documentation/validation.md) now require. An
  `examples/next` app, built in CI, is also the hydration regression test
  the SSR page currently asks readers to run by hand.
- **A browser-extension devtools.** The in-page panel proves the display; an
  extension would add store discovery, a page bridge, and cross-context
  messaging to reach forms without a component in the tree. Only worth it once
  the panel's shape has settled and the playground tab above exists.
- **YAML input for the JSON Schema mode.** OpenAPI documents travel as YAML
  at least as often as JSON, but reading them means a yaml dependency, and
  the CLI carries two dependencies on purpose. Deliberately out for now;
  the error message names the one-line conversion. Revisit if the mode
  gets real use.
- **Visual regression snapshots** for the playground, on top of the Playwright
  e2e job (baseline images plus pixel diff). Parked, not planned: the e2e
  job has grown real render-integrity assertions since this was written,
  and a pixel baseline across six UI kits is more maintenance than signal
  until the kits' own release cadence stops moving the pixels for us.
- **The `zf-` CSS prefix.** `zf-field` / `zf-error` / `zf-label` predate the
  rename from "zustand forms" to formstand by a month. Considered on
  2026-07-31 and deliberately left alone: it is a documented public CSS API,
  and generated files in users' repos have it baked in. If it ever moves it
  needs the deprecation policy below, and `fs-` is a poor replacement because
  it reads as "filesystem" to JS developers.

## Internal debt

Cleanup items verified real but outranked by correctness fixes at the time.
Fair game for any slow afternoon; none block features. Re-checked against the
source on 2026-09-23 (sweep in the `chore/internal-debt-sweep` branch).

- `KindUsage`'s booleans become a `ReadonlySet<kind>`. Still true, and
  deliberately left: about 230 read sites across the kit adapter sections,
  all mechanical, where a missed key only shows up as import drift in the
  generated output. Worth doing the day the adapters change anyway.
- `persistForm`'s `manual` plus `restore`-semantics combination is unreachable
  (the apply mode collapses two orthogonal axes); a `{ autoApply, baseline }`
  shape would cover all four without a breaking change. Still true (the
  0.18 `load()` rename did not touch it); an API-shape call for Tim, so
  it waits for the 1.0 soak rather than landing in a sweep.
- The Schema builder's name-stem rule (strip one trailing `Form`) is
  spelled in `namingFor`, `ownerHookName`, and the demo's `generate.ts`.
  Sharing it means exporting the stem rule across the cli/examples
  boundary; small, but not worth a public API surface on its own.

Closed on 2026-09-23: `SectionPlan` now carries its leaf `FieldPlan`s
(`objectSectionFile` reads its own slice instead of string-matching the
flat plan); `camelJoin` and `casing.camelCase` share one `lowerFirst`; the
plain kind-to-builder mapping is one exported `plainBuilderName`; the Schema
builder emits from `useDeferredValue`'d inputs (memo on its rows would not
help: their callbacks are per-render by design); the `parsePath` cache is a
real LRU; `persistForm` and `useField` share `createDebouncer`. Already
closed before the sweep and struck from the list: the three validate paths
have shared `commitScopedErrors` since 2026-07-16 (090dec0), and
`useVariantField` derives through `FieldValue` since 774d98c. `FieldPathArg`
stays: six call sites.

## How releases happen

Features land on `main` behind green CI (typecheck, lint, coverage-gated
tests, both builds, and the single-React, bundle-size, generated-demo-freshness,
doc-link, and built-bundle e2e guards), docs and playground deploy on every
push, and npm releases are cut from tags via trusted publishing with
provenance. "Docs and examples" work ships continuously; package versions move
when `src/` or `cli/src` does.

**Deprecation policy (from 1.0).** Nothing on the public API list is removed
in the release that deprecates it. A deprecation ships in a minor with a
`@deprecated` tag naming the replacement, a CHANGELOG entry under
`### Changed`, and a one-time dev-mode console warning where the surface is
runtime (a CSS class or an emitted file layout gets a docs note instead).
The removal lands no earlier than the next major, and the CHANGELOG entry
for the major lists every removal with the minor that announced it. The CLI
follows the same rule for flags and config keys, with the extra step that a
removed flag keeps parsing for one major and prints the replacement.
