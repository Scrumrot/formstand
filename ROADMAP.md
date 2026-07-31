# Roadmap

A living plan for **formstand** (the library) and **formstand-cli** (the
generator), ordered by intent, not promise. Items move between horizons as
reality votes. Shipped work graduates to the [CHANGELOG](./CHANGELOG.md).

_Last updated: 2026-07-31 (formstand 0.13.0, formstand-cli 0.10.1)._

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

## Now

- **Devtools.** `formstand/devtools` is built and on `main` under
  `## Unreleased`: a panel with per-field rows, the two error channels shown
  separately, a live `diff()`, and snapshot/restore. Remaining before it is
  really done: a playground tab so people can try it without installing, and
  a release to put it on npm.
- **Responsive generated output.** `--columns 2|3` emits fixed grid tracks, so
  generated forms do not reflow on a phone. Seven playground demos still show
  this. The fix belongs in the emitters (a minmax/auto-fit track, or a
  breakpoint per kit dialect), which changes output for every CLI user, so it
  wants a deliberate design pass rather than a patch.
- **Layout control.** Today layout is two coarse flags, `--sections` and
  `--columns`, applied uniformly to a whole form. The ask is real control:
  flexbox and CSS grid, or the kit's own layout components (MUI `Grid`, Chakra
  and Mantine `SimpleGrid`, antd `Row`/`Col`), and per-field or per-section
  placement rather than one column count for everything (this field spans two,
  these three sit in a row).

  Some of the machinery exists: every kit backend already emits that kit's
  layout dialect for `--columns`. What is missing is a way to *say* what the
  layout should be. The `fields` block in `formstand.config.ts` is the obvious
  home, since it already addresses fields by path for component overrides, but
  it is worth deciding whether layout belongs in config, in schema `.meta()`,
  or both before building either. This is also where the responsive item above
  gets solved properly rather than patched, so the two want designing together.

- **StackBlitz links.** "Open in StackBlitz" from docs examples and playground
  tabs, seeded with the demo source plus formstand from npm.
- **Brand collateral.** OG images for docs and playground pages, and a README
  header. The identity exists; it still doesn't travel.
- **VitePress 2 migration.** The docs run VitePress 1.6.x, whose nested vite
  toolchain carries dev-only advisories (the deployed site is static). A first
  attempt at v2 alpha rendered the custom theme blank: builds fine, no console
  errors, theme/CSS API changes to chase. Migrate when v2 stabilizes.

## Later / parking lot

- **An interactive CLI wizard.** `formstand-gen --wizard` walking through the
  questions the flags ask: which file, which export, which kit, which layout,
  where to write it. The flag semantics are already modelled once, in the
  playground's CLI command builder tab, so the wizard is the terminal port of
  something that exists rather than a fresh design.

  Two constraints to respect. It must be **explicitly opt-in**, never
  triggered by a bare `formstand-gen` or by a TTY check: the CLI streams to
  stdout by default and is meant to be scriptable, and a prompt that appears
  when a pipe does not would break both CI and any agent driving it. And the
  CLI currently has two dependencies (`jiti`, `typescript`), so a prompts
  library is a real addition to weigh against hand-rolled `readline`.

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
