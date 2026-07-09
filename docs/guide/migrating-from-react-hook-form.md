# Migrating from react-hook-form

This page maps the react-hook-form API you know onto its formstand counterpart, then spells out the semantic differences hiding behind the familiar names. The philosophical gap first: react-hook-form is *input-first* — you `register` DOM inputs, and form state grows out of what's mounted; formstand is *schema-first* — your zod schema declares every field, its type, and its rules up front, and state lives in a plain zustand store that exists independently of what's rendered. There is no `register`, no `control` object, and no resolver layer: the schema **is** the resolver, paths are typed against it, and anything React can do (hooks, bound components) the store can also do imperatively.

## The mapping

| react-hook-form | formstand |
| --- | --- |
| `useForm({ resolver: zodResolver(schema), defaultValues })` | `useForm(schema, { initialValues })` — zod only, no resolver layer; see [Getting started](./getting-started) |
| `register("name")` | none needed — bound components (`<TextField form={form} path="name" />`), the [prop builders](./components#prop-builders-for-custom-markup) (`{...textInputProps(useField(form, "name"))}`), or [`useField`](./getting-started#reading-state-three-ways) directly |
| `handleSubmit(onValid, onInvalid)` | `form.handleSubmit(onValid, onInvalid?)` — also resolves a [`SubmitResult`](../api/#submitresult-toutput) with a `kind` of `"valid" \| "invalid" \| "skipped" \| "error"`, so you can branch on the outcome instead of threading callbacks |
| `watch("name")` / `useWatch` | `useFormSelector(form, (s) => s.values.name)` in React, `form.watchValue("name", listener)` outside it — or `useField(form, "name").value` if you're rendering the field anyway |
| `trigger()` / `trigger("name")` / `trigger(["a", "b"])` | `form.validate()` / `form.validateField("name")` / `form.validateFields(["a", "b"])` — see [Validation](./validation) |
| `setValue("name", v)` | `form.setValue("name", v)` — path *and* value type are compile-checked ([Typed paths](./typed-paths)) |
| `getValues()` / `getValues("name")` | `form.getState().values` / `form.getField("name")` |
| `getFieldState("name")` | `form.getFieldState("name")` — value, error, touched, dirty, isValidating |
| `setError("name", { message })` / `clearErrors("name")` | `form.setError("name", "message")` / `form.clearErrors("name")` — but these write a separate **server channel**, not the schema's map; see below |
| `setFocus("name")` | `focusField("name")` — finds the control by its `name` attribute, no ref plumbing; see the [recipe](./recipes#focus-a-field-imperatively) |
| `reset(values, { keepDirty, ... })` | `form.reset(nextInitial?, { keepErrors?, keepTouched?, keepSubmitCount? })` — no `keepDirty`, deliberately; see below |
| `resetField("name")` | `form.resetField("name")` |
| `formState.errors.name.message` | `state.errors["name"]?.[0]` — a flat map keyed by dot paths, each entry a `readonly string[]` of **every** message |
| `formState.isDirty` | `useIsDirty(form)` — derived from `values` vs `initialValues`, never stored |
| `formState.dirtyFields` | `form.dirtyFields()` (paths) or `form.diff()` (a PATCH payload) — derived on demand |
| `formState.touchedFields` | `state.touched` — a flat `Record<path, boolean>`, e.g. `useFormSelector(form, (s) => s.touched["name"])` |
| `formState.isSubmitting` | `useIsSubmitting(form)` |
| `formState.isSubmitted` / `submitCount` | `useSubmitCount(form)` (`> 0` ≙ `isSubmitted`) |
| `formState.isValid` / `isValidating` | `useIsValid(form)` / `state.isValidatingForm` and per-field `state.isValidating[path]` |
| `useFieldArray({ control, name })` | `useFieldArray(form, "items")` (item type inferred from the schema) — same stable-identity story: `fields[i].id` as the React key; `push`/`remove`/`insert`/`move`/`swap` (no `prepend`/`update` — `insert(0, item)` and `setValue("items.2", item)`) — see [Field arrays](./field-arrays) |
| `mode` / `reValidateMode` | same option names, one semantic difference — see below |
| `<Controller render={...} />` / `useController` | no controller: `useField` + a small adapter that maps `UseFieldReturn` onto your UI kit's props — the [MUI demos](./examples#material-ui) show the full pattern |

## The differences behind the names

### `setError` writes a different channel

In react-hook-form, `setError` and validation write the same `errors` object and can clobber each other. formstand keeps two channels: validation owns `schemaErrors`, your `setError`/`setErrors` calls own `serverErrors`, and the `errors` map your UI reads is their merge. The consequences are the useful part: a background validation pass can never wipe your "username already taken" message, and the server verdict is **released automatically when the user edits that field** — no manual `clearErrors` bookkeeping on every change handler. Read [Errors: schema & server](./errors) before porting `setError` calls; it will delete code.

### `reset` has no `keepDirty`

Dirtiness in formstand is never stored — a field is dirty exactly while its value differs from `initialValues` at that path. `reset` makes those equal by definition, so a kept dirty flag would contradict every field-level read. If you used `keepDirty` to survive a rebase of the baseline, `form.adoptValues(values)` is the real operation: it swaps `values` *and* `initialValues` mid-session while preserving `touched` and `submitCount` — see [reset vs adoptValues](./state#reset-vs-adoptvalues).

### `mode: "onChange"` really means change

In formstand, `mode: "onChange"` validates on change events **only** — blur does not validate. If you want react-hook-form's practical behavior of "validate eagerly on everything", use `mode: "all"` (change *and* blur). `"onBlur"`, `"onSubmit"`, and `"onTouched"` behave as you expect, and `reValidateMode` (default `"onChange"`) takes over after the first submit attempt, same as react-hook-form. See [Validation modes](./validation#modes).

### Submit tells you what happened

`submit`/`handleSubmit` resolve a discriminated [`SubmitResult`](../api/#submitresult-toutput): `"valid"` (your handler ran with `z.output`-typed data), `"invalid"` (errors written and errored fields marked touched), `"skipped"` (a submit was already in flight), or `"error"` (your handler threw — submit resolves instead of rejecting, so no unhandled rejections from event handlers). `onInvalid` still exists, but most react-hook-form callback choreography becomes a `switch` on `result.kind`.

## What has no equivalent

Honesty section — these knobs don't exist, mostly because the architecture removes the problem they solved:

- **`register` / `unregister` / `shouldUnregister`** — there is no registration step. Fields exist because the schema declares them; unmounting an input never discards its value. If a hidden step's values shouldn't submit, model that in the schema (a discriminated union) or strip them in `onValid`.
- **`criteriaMode`** — no knob: every error entry is already a `readonly string[]` carrying *all* messages for that path; render `[0]` for `firstError` behavior.
- **`shouldFocusError`** — failed submits don't auto-focus. Call [`focusFirstError(errors)`](./errors#focusing-the-first-error) in `onInvalid`; it's one line and you control the scoping.
- **`delayError`** — errors render when you render them; gate on `touched` for the common case. The adjacent need — not validating on every keystroke — is `useField`'s `debounceMs` option ([debounced validation](./validation#debounced-per-field-validation)).
- **Resolvers for yup/vest/joi/...** — formstand is zod-first by design; the schema drives path types, empty-value introspection, and field-scoped validation, which a generic resolver interface can't.
- **`values` prop reactivity** — `useForm` locks schema and options on first render. Async data arriving later is an explicit call: `form.adoptValues(data)` (rebase) or `form.reset(data)` (wipe).
- **`disabled` on `useForm`/`register`** — disabling inputs is your JSX's business; the store doesn't track it.
- **`shouldUseNativeValidation`** — no native constraint API integration; zod is the single validation source.

## Next

- [Getting started](./getting-started) — the quickstart, in formstand's own vocabulary.
- [Typed paths](./typed-paths) — the compile-time contract `register` never gave you.
- [Errors: schema & server](./errors) — the two-channel model in depth.
- [Recipes](./recipes) — server errors, wizards, autosave, imperative focus.
