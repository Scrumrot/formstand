# Roadmap

A living plan for **formstand** (the library) and **formstand-cli** (the
generator), ordered by intent, not promise. Items move between horizons as
reality votes. Shipped work graduates to the [CHANGELOG](./CHANGELOG.md).

_Last updated: 2026-08-06 (formstand 0.15.0, formstand-cli 0.10.1 plus the
unreleased container-layout work on `main`)._

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

**Since then (0.14 and 0.15, plus unreleased CLI work on `main`)**

- `formstand/devtools` (0.14.0): an in-page panel with per-field rows, both
  error channels shown separately, a live `diff()`, and snapshot/restore.
- `persistForm` hardening (0.15.0): a shape guard that discards drafts whose
  stored shape conflicts with the current schema, and an opt-in `version` so
  schema migrations can invalidate old drafts deliberately.
- Responsive `--columns` and kit-native containers (CLI, unreleased):
  multi-column output collapses to one column on a phone in every backend,
  and antd, Mantine, and MUI sections now lay out with their kit's own
  Row/Col, Grid/Grid.Col, and Grid components instead of inline CSS grid.

## Now

- **Ship the container-layout CLI release.** The responsive `--columns` and
  kit-container work sits on `main` under `## formstand-cli Unreleased`, with
  three confirmed edge-config bugs from its code review to fix first: the
  module union section at `columns > 1` renders a `Stack` its imports don't
  include, a tuple-only root emits containers the import gate never counted,
  and a module nested fieldset lost its full-row span for the CSS-grid
  backends. Fix, extend the matrix with tuple-only and root-union schemas so
  the class cannot recur, then cut the release.
- **Per-field layout placement.** Phase 1 landed: every backend emits its
  kit's own layout dialect for `--columns`, responsive by default. Phase 2 is
  saying more than one column count for a whole form: this field spans two,
  these three sit in a row. The agreed home is a `span` in the `fields` block
  of `formstand.config.ts`, which already addresses fields by path for
  component overrides. The per-child cell hook the container migration added
  (`Backend.gridChild`) is the seam a span flows through.
- **A step-by-step CLI wizard.** `formstand-gen --wizard` walking through the
  questions the flags ask, one at a time: which file, which export, which kit,
  which layout, columns or not, where to write it, ending with the composed
  command printed so the run is reproducible without the wizard. The flag
  semantics are already modelled once, in the playground's CLI command builder
  tab, so this is the terminal port of something that exists rather than a
  fresh design.

  Two constraints to respect. It must be **explicitly opt-in**, never
  triggered by a bare `formstand-gen` or by a TTY check: the CLI streams to
  stdout by default and is meant to be scriptable, and a prompt that appears
  when a pipe does not would break both CI and any agent driving it. And the
  CLI currently has two dependencies (`jiti`, `typescript`), so a prompts
  library is a real addition to weigh against hand-rolled `readline`.

- **More schema inputs: JSON Schema and OpenAPI.** The CLI reads two sources
  today, a zod schema export and a TS type, through two front-ends
  (`fromZod`, `fromType`) that meet in one IR every emitter consumes. A JSON
  Schema front-end is a third door into the same IR, and it follows the type
  mode's path rather than zod mode's: the input carries no runtime validator,
  so the generator emits a zod schema beside the component the way
  `--schema-out` already does for TS types.

  OpenAPI is mostly a pointer exercise on top: 3.1 component schemas *are*
  JSON Schema, so the work is selecting which one (a flag naming
  `#/components/schemas/X` or an operation's request body) plus `$ref`
  resolution. The design questions are mapping fidelity, not plumbing: which
  keywords translate cleanly (`allOf` merging, `oneOf` as unions, string
  `format`s), which degrade to the existing TODO-comment fallback
  (`patternProperties`, tuple `items` arrays), and 3.0's `nullable: true`
  dialect versus 3.1's type arrays. This also serves the larger aim of the
  CLI as a generator agents drive: an agent holding an OpenAPI spec should
  get a typed form from it without hand-translating the schema first.

- **StackBlitz links.** "Open in StackBlitz" from docs examples and playground
  tabs, seeded with the demo source plus formstand from npm.
- **Brand collateral.** OG images for docs and playground pages, and a README
  header. The identity exists; it still doesn't travel.
- **VitePress 2 migration.** Done and parked: the `chore/vitepress-2` branch
  builds and renders the full site on 2.0.0-alpha.18 (the historic blank-theme
  failure no longer reproduces there; no root cause beyond "fixed in alpha").
  Merge when v2 ships a stable release.

## Later / parking lot

- **A devtools playground tab.** The panel shipped in 0.14.0; a playground
  tab would let people try it without installing.
- **Generated tests.** A spec emitted beside the component: it renders, every
  field is present and labelled, a required field reports its message, submit
  calls the handler with parsed data. Mechanical to generate and genuinely
  useful, since it is the coverage nobody writes by hand. The schema already
  knows what to assert.

  **A list of runners, not a choice.** `--tests vitest`, `jest`,
  `playwright`, or any combination, because a project can legitimately want
  both a component spec and an e2e spec. That means the flag takes a list and
  the config file grows a `tests` block, the way `ui`/`layout` already work.

  **Combos are not the same test twice.** Vitest and Jest generate a
  component spec (render, fill, assert against the schema's messages);
  Playwright generates a browser spec (navigate, fill by label and role,
  assert visible text). Different tests, not one template with syntax
  variants. The shape that fits is the one the generator already uses for
  components: derive the *cases* from the schema once (required fields,
  min/max, enum options, array minimums) into an IR, then emit per runner.

  **Custom config is a requirement, not a nicety, for kit output.** The
  generator deliberately never emits providers, so a generated MUI, Chakra, or
  Mantine component does not render without the app's theme or provider
  wrapper. A generated test that calls a bare `render()` therefore fails on
  the first line for exactly the targets people most want tests for. So the
  `tests` block needs to accept the project's own setup: a custom render
  wrapper, a setup file, Playwright fixtures, a base URL.

  The remaining question is how not to emit tests that assert trivia. A suite
  proving only that the component renders is maintenance cost dressed as
  confidence; the value is in the validation and submit paths, which are the
  parts that need the schema to write.

- **A browser-extension devtools.** The in-page panel proves the display; an
  extension would add store discovery, a page bridge, and cross-context
  messaging to reach forms without a component in the tree. Only worth it once
  the panel's shape has settled.
- **`--path-depth` flag.** `createForm` can widen its typed-path budget, but
  the CLI has no matching flag, so generated bindings past nine segments
  degrade to a TODO even when the form could type them.
- **Visual regression snapshots** for the playground, on top of the Playwright
  e2e job (baseline images plus pixel diff, vs today's render-integrity
  assertions and three screenshots).
- **Field-level async coordination**: a documented pattern, or a helper, for
  forms with several independent async validators in flight. The pieces exist;
  the ergonomics could be sharper.
- **The `zf-` CSS prefix.** `zf-field` / `zf-error` / `zf-label` predate the
  rename from "zustand forms" to formstand by a month. Considered on
  2026-07-31 and deliberately left alone: it is a documented public CSS API,
  and generated files in users' repos have it baked in. If it ever moves it
  needs a deprecation window, and `fs-` is a poor replacement because it reads
  as "filesystem" to JS developers.

## Internal debt

Cleanup items verified real but outranked by correctness fixes at the time.
Fair game for any slow afternoon; none block features. Re-checked against the
source on 2026-07-31.

- `validateFields` / `validateFieldsAsync` / `commitFieldErrors` share one
  commit helper (the server-error release contract lives in three places).
- `SectionPlan` carries its leaf `FieldPlan`s so `objectSectionFile` stops
  re-walking and string-matching what `buildPlan` already computed.
- `KindUsage`'s booleans become a `ReadonlySet<kind>`.
- `camelJoin` delegates to `casing.camelCase`; the plain-UI kind-to-builder
  mapping in `moduleLayout` gets one `plainBuilderName` helper; the Schema
  builder's name-stem rule reuses `namingFor`.
- Schema builder polish: `memo` the row components, `useDeferredValue` the
  emission input so typing never waits on codegen.
- `useVariantField`'s return type re-derives what `FieldValue` already
  computes. Reuse `FieldValue<..., \`${P}.${TField}\`>` and keep
  `UnionValueAt` only for the key constraint.
- `persistForm`'s `manual` plus `restore`-semantics combination is unreachable
  (the apply mode collapses two orthogonal axes); a `{ autoApply, baseline }`
  shape would cover all four without a breaking change.
- The `parsePath` cache resets wholesale on overflow; an LRU, or a per-form
  cache at the hook layer, would avoid re-parse storms for apps whose live
  path set exceeds the cap.
- `persistForm` and `useField` each hand-roll a trailing-edge debounce. One
  shared `createDebouncer(fn, ms)` could back both.

Closed since the last update: `FieldPathArg` was listed as exported but
unused. It now has six call sites, so the item is gone rather than done.

## How releases happen

Features land on `main` behind green CI (typecheck, lint, coverage-gated
tests, both builds, and the single-React, generated-demo-freshness,
doc-link, and built-bundle e2e guards), docs and playground deploy on every
push, and npm releases are cut from tags via trusted publishing with
provenance. "Docs and examples" work ships continuously; package versions move
when `src/` or `cli/src` does.
