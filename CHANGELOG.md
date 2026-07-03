# Changelog

## 0.2.0 — 2026-07-02

The result of a full-repo review pass (see `TODO.md` items 1–34).

### Breaking

- Errors are split into two stored channels: `FormState.schemaErrors`
  (validation-owned, rebuilt every pass) and `FormState.serverErrors`
  (app-owned via `setError`/`setErrors`, invisible to validation).
  `FormState.errors` remains the map hooks read but is now derived from the
  channels (schema wins at a key, server shows where the schema is silent) —
  patch the channels through `updateState`, not `errors`.
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
