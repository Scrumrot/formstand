# API reference

This page covers the full exported surface of formstand: the `Form` instance methods, creation options and result types, every React hook and component, the prop builders, the exported core utilities, and the complete type list. For narrative guides, start at [Getting started](../guide/getting-started).

## `createForm(schema, options)`

Creates a `Form<TSchema>` instance. React users typically use [`useForm`](#react-hooks) instead, which wraps this.

```ts
const form = createForm(schema, {
  initialValues,              // z.input<TSchema> — required
  mode: "onBlur",             // ValidationMode, default "onBlur"
  reValidateMode: "onChange", // ValidationMode used once submitCount > 0
  validateOnMount: false,     // run a validation pass at creation
});
```

### `CreateFormOptions<TSchema>`

| Option | Type | Notes |
| --- | --- | --- |
| `initialValues` | `z.input<TSchema>` | required; also the baseline for dirtiness |
| `mode` | `ValidationMode` | `"onChange" \| "onBlur" \| "onSubmit" \| "onTouched" \| "all"`, default `"onBlur"` |
| `reValidateMode` | `ValidationMode` | mode used after the first submit attempt, default `"onChange"` |
| `validateOnMount` | `boolean` | validate at creation so `useIsValid` reflects the initial values (async schemas validate in the background) |

## `Form<TSchema>` methods

| Method | Notes |
|---|---|
| `schema` / `store` | the schema and the underlying zustand store (`getState` / `getInitialState` / `subscribe`) |
| `getState()` / `subscribe(listener)` | direct store access; `listener(state, prev)` fires on every change |
| `setValue(path, value)` | updates one field. Dirtiness is derived, not stored: a field reads as dirty while its value differs structurally from `initialValues` at that path (arrays/plain objects compare deep, Dates by timestamp, `Object.is` otherwise) |
| `setValues(next)` | replace the entire values object; server errors release only where a value slice actually changed |
| `setTouched(path, touched?)` | marks a path touched (default `true`) |
| `setSubmitting(value)` | manually set the `isSubmitting` flag |
| `setError(path, errors)` / `setErrors(map)` / `clearErrors(path?)` | the app-owned **server error channel** (`state.serverErrors`) — validation never touches it; `setError` accepts a single string or an array; `clearErrors(path)` clears both channels at the path and its descendants (`clearErrors("")` clears just the root entry; `clearErrors()` clears everything); `setErrors` replaces the whole server channel |
| `setMode(mode)` / `setReValidateMode(mode)` | switch validation modes at runtime |
| `reset(nextInitial?, options?)` | reset to initial; optional partial overrides (shallow-merged for record roots, replaced wholesale otherwise) and [`ResetOptions`](#resetoptions) (no `keepDirty` — dirtiness derives from values vs initial, and reset makes them equal) |
| `resetField(path)` | reset one field to its initial value, clearing its (and descendants') error/touched state |
| `adoptValues(values)` | mid-session rebase: replaces `values` + `initialValues` and clears `errors` and in-flight validation flags (`isValidating`/`isValidatingForm` — the rebase disowns in-flight passes), but **preserves** interaction state (`touched`, `submitCount`, `isSubmitting`, `mode`). Use `reset()` for a full wipe |
| `updateState(updater)` | atomic multi-field patch; `errors` is derived from `schemaErrors`/`serverErrors`, so patch the channels — the patch type omits `errors` entirely, and a plain-JS `errors` patch is warned about and ignored |
| `validate()` / `validateField(path)` / `validateFields(paths)` | sync validation; on an async schema they transparently start the async pass instead (`validate`/`validateField` return `{ kind: "pending", promise }`, `validateFields` returns the `Promise<boolean>` itself) |
| `validateAsync()` / `validateFieldAsync(path)` / `validateFieldsAsync(paths)` | async; supports `async .refine` |
| `submit(onValid, onInvalid?, { force? })` | full submit flow, returns `Promise<SubmitResult>`; resolves `{ kind: "valid", data }`, `{ kind: "invalid", errors }` (errored fields are also marked touched), `{ kind: "skipped" }` when another submit is in flight and `force` isn't set, or `{ kind: "error", error }` when `onValid` throws/rejects (submit resolves instead of rejecting, so `handleSubmit` never leaves an unhandled rejection) |
| `handleSubmit(onValid, onInvalid?, options?)` | returns an event handler that calls `preventDefault()` and runs `submit` |
| `getField(path)` | typed one-shot value read |
| `getFieldState(path)` | typed one-shot read of a field's full slice — a [`FieldSnapshot`](#fieldsnapshot) |
| `watchField(path, listener)` | subscribe to one field's [`FieldSnapshot`](#fieldsnapshot); returns an unsubscribe function |
| `watchValue(path, listener)` | subscribe to one path's value (`Object.is`-compared); `listener(next, prev)` |
| `watchValues(listener)` | subscribe to the values object; `listener(values, prev)` |
| `diff()` / `dirtyFields()` | PATCH-style helpers, derived by comparing `values` against `initialValues`: minimal divergent paths (objects recurse to the changed leaves; arrays report their base path). Reverting a field drops it |
| `snapshot()` / `restore(snap)` | full state capture/restore for undo/rollback; `restore` re-derives the merged `errors` map from the snapshot's channels |
| `arrayPush(path, item)` / `arrayRemove(path, index)` / `arrayInsert(path, index, item)` / `arrayMove(path, from, to)` / `arraySwap(path, a, b)` | array ops with meta-key re-keying (errors/touched/server verdicts follow their rows); out-of-range or non-integer indices are refused with a warning |

All paths on the imperative surface are `FieldPath`-typed; runtime-built strings need a cast — see [Typed paths](../guide/typed-paths#dynamic-paths).

## Result and option types

### `SubmitResult<TOutput>`

```ts
type SubmitResult<TOutput> =
  | { kind: "valid"; data: TOutput }      // validation passed, onValid ran to completion
  | { kind: "invalid"; errors: ErrorMap } // onInvalid ran, errors written, fields marked touched
  | { kind: "skipped" }                   // another submit was in flight and force wasn't set
  | { kind: "error"; error: unknown };    // onValid threw or rejected — submit resolves with the
                                          // thrown value instead of rejecting; no error state is
                                          // written (surface it yourself, e.g. via setError)
```

### `ResetOptions`

```ts
type ResetOptions = {
  keepErrors?: boolean;      // keep both error channels
  keepTouched?: boolean;     // keep the touched map
  keepSubmitCount?: boolean; // keep submitCount
};
```

### `FieldSnapshot<TValue>`

Returned by `getFieldState` and passed to `watchField` listeners:

```ts
type FieldSnapshot<TValue> = {
  value: TValue;
  error: readonly string[] | undefined;
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
};
```

### Validation results

```ts
type ValidationResult<TOutput> =
  | { kind: "valid"; data: TOutput }
  | { kind: "invalid"; errors: ErrorMap }
  | { kind: "pending"; promise: Promise<SettledValidationResult<TOutput>> };

type FieldValidationResult =
  | { kind: "valid" }
  | { kind: "invalid"; errors: readonly string[] }
  | { kind: "pending"; promise: Promise<SettledFieldValidationResult> };
```

`SettledValidationResult` / `SettledFieldValidationResult` are the same unions without the `"pending"` arm.

## React hooks

| Hook | Signature | Notes |
| --- | --- | --- |
| `useForm` | `useForm(schema, options): Form<TSchema>` | lazy-creates a form held for the component's lifetime; schema/options changes after mount are ignored (warned once) |
| `useField` | `useField(form, path, options?): UseFieldReturn<V>` | one field's slice + helpers; `path` may be a selector `(state) => string` (returns `UseFieldReturn<unknown>`); `options: { debounceMs?: number }` debounces triggered validation |
| `useFieldArray` | `useFieldArray<TItem>(form, path): UseFieldArrayReturn<TItem>` | array ops + stable ids; see [Field arrays](../guide/field-arrays) |
| `useFormSelector` | `useFormSelector(form, selector): U` | selector-style subscription over `FormState` |
| `useFormSelectorShallow` | `useFormSelectorShallow(form, selector): U` | shallow-compared variant, required for object/array-returning selectors |
| `useFormError` | `useFormError(form): readonly string[] \| undefined` | shortcut for the root `""` error |
| `useIsDirty` | `useIsDirty(form): boolean` | any field dirty (derived) |
| `useIsValid` | `useIsValid(form): boolean` | no errors currently in the merged map (not a fresh validation) |
| `useIsSubmitting` | `useIsSubmitting(form): boolean` | `state.isSubmitting` |
| `useSubmitCount` | `useSubmitCount(form): number` | `state.submitCount` |
| `createFormContext` | `createFormContext<TSchema>(): { Provider, useFormContext }` | typed context factory for prop-drilling-free forms |

`useFormState` / `useFormStateShallow` still exist as **deprecated aliases** of `useFormSelector` / `useFormSelectorShallow` — renamed because React DOM ships its own (deprecated) `useFormState` and auto-imports regularly grabbed the wrong one.

### `UseFieldReturn<TValue>`

| Field | Type | Notes |
| --- | --- | --- |
| `path` | `string` | the resolved path — used as the input's `name` |
| `value` | `TValue` | typed via `FieldValue` when the form carries a schema |
| `initialValue` | `TValue` | the `initialValues` slice `dirty` compares against |
| `emptyValue` | `null \| undefined` | what a cleared input writes back: introspected from the zod schema (`.nullable()` → `null`, `.optional()` → `undefined`), with an initial-value fallback for schema-less forms |
| `error` | `readonly string[] \| undefined` | from the merged error map |
| `touched` / `dirty` / `isValidating` | `boolean` | |
| `setValue(v)` | | writes the value and triggers mode-appropriate validation |
| `setTouched(touched?)` | | |
| `setError(errors)` | | writes the server channel at this path (`readonly string[]`) |
| `clearError()` | | `clearErrors(path)` — both channels at this path and descendants |
| `validate()` / `validateAsync()` | | field-scoped validation |
| `onBlur()` | | marks touched and triggers mode-appropriate validation |

### `UseFieldArrayReturn<TItem>`

| Field | Type |
| --- | --- |
| `fields` | `readonly { id: string; value: TItem }[]` — use `id` as the React key |
| `items` | `readonly TItem[]` |
| `length` | `number` |
| `error` | `readonly string[] \| undefined` — the array-level error |
| `push(item)` / `remove(index)` / `insert(index, item)` / `move(from, to)` / `swap(a, b)` | wrappers over the form's array ops |

## Components

All bound components render `name={path}`, `aria-invalid`, `aria-describedby`, and the error with `role="alert"`, and accept a `ref` to the underlying element — see [Bound components](../guide/components).

| Component | Props type | Element |
| --- | --- | --- |
| `TextField` | `TextFieldProps` | `input` (`text`/`password`/`email`/`url`/`tel`) |
| `NumberField` | `NumberFieldProps` | `input type="text" inputMode="decimal"` with partial-entry handling |
| `CheckboxField` | `CheckboxFieldProps` | `input type="checkbox"` |
| `SelectField` | `SelectFieldProps<T>` (`options: SelectFieldOption<T>[]`, `placeholder?`) | `select`, stays controlled while empty |

### Prop builders

Pure functions over a `useField` result, for custom markup:

| Builder | Returns | Spread onto |
| --- | --- | --- |
| `textInputProps(field)` | `TextInputProps` | `<input>` / `<textarea>` |
| `numberInputProps(field)` | `NumberInputProps` | `<input>` (stateless `type="number"` binding) |
| `checkboxProps(field)` | `CheckboxProps` | `<input>` |
| `selectProps(field)` | `SelectProps` | `<select>` |

### `focusFirstError(errors, root?)`

Focuses the first control (in DOM order) whose `name` matches an errored path — exactly or as a descendant of an errored container path. Most specific wins: the root `""` error falls back to the first control only when no field-keyed error matches — and with the default `document` scope that fallback is refused (returns `false`) when the page holds more than one `<form>`, since "first control" would be ambiguous. On multi-form pages pass the form element (e.g. via a ref) as `root`. Skips controls that can't take focus (hidden, disabled, inside a closed `<dialog>`) and verifies focus actually landed, trying the next match otherwise. Returns `boolean` — `true` only when a control actually holds focus; SSR-safe to import.

## Core utilities

Exported for building on top of the same primitives the library uses:

```ts
parsePath(path: string): readonly PathSegment[]   // "a.0.b" → ["a", 0, "b"]
getAtPath(obj: unknown, path: string): unknown    // read a dot path
setAtPath<T>(obj: T, path: string, value): T      // immutable write, containers created as needed

validateSync(schema, values): SettledValidationResult<Output>   // safeParse + flattenIssues
validateAsync(schema, values): Promise<SettledValidationResult<Output>>
flattenIssues(issues): ErrorMap                   // zod issues → path-keyed map (unions expanded per branch)
isAsyncRequiredError(e: unknown): boolean         // "schema needs async parsing" detector

shouldValidateOn(trigger, mode, reValidateMode, submitAttempted, touched?): boolean
```

`shouldValidateOn` is the mode-resolution rule the hooks use: `trigger` is `"change"` or `"blur"`, and `reValidateMode` replaces `mode` once `submitAttempted` is true.

## Exported types

Everything importable via `import type { ... } from "formstand"`:

- **Core:** `Form`, `CreateFormOptions`, `SubmitHandler`, `InvalidSubmitHandler`, `SubmitOptions`, `SubmitResult`, `ResetOptions`, `ReadonlyStoreApi`, `FieldSnapshot`
- **State:** `FormState`, `ErrorMap`, `BoolMap`
- **Paths:** `PathSegment`, `FieldPath`, `FieldValue`
- **Validation:** `ValidationResult`, `SettledValidationResult`, `FieldValidationResult`, `SettledFieldValidationResult`, `ValidationMode`, `ValidationTrigger`
- **Hooks:** `FormStateApi`, `UseFieldReturn`, `FieldFormApi`, `FieldPathArg`, `UseFieldOptions`, `UseFieldArrayReturn`, `FieldArrayFormApi`, `FieldArrayEntry`, `FormProviderProps`, `FormContextApi`
- **Components:** `TextFieldProps`, `NumberFieldProps`, `CheckboxFieldProps`, `SelectFieldProps`, `SelectFieldOption`, `FieldRef`
- **Prop builders:** `TextInputProps`, `NumberInputProps`, `CheckboxProps`, `SelectProps`

`FieldFormApi` / `FieldArrayFormApi` / `FormStateApi` are the structural (schema-less) form interfaces the hooks accept — useful for writing reusable field components that take any form. When a real `Form<TSchema>` is passed, the typed overloads bind instead and path inference is preserved.
