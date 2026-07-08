# Changelog

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
