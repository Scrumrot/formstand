# API reference

The full exported surface of formstand, split across four pages:

- **This page**: `createForm`, the `Form` instance methods, and the result and option types.
- [Hooks](./hooks): every React hook and what it returns.
- [Components and bindings](./components): the bound components, the prop builders, `useNumberInput`, and the focus helpers.
- [Utilities and types](./utilities): the exported core functions and the complete type list.

For narrative docs, start at [Getting started](../getting-started).

## `createForm(schema, options)`

Creates a `Form<TSchema>` instance. React users typically use [`useForm`](./hooks#react-hooks) instead, which wraps this.

```ts
const form = createForm(schema, {
  initialValues,              // z.input<TSchema>, required
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
| `pathDepth` | `PathDepth` literal (`0`–`25`) | **type-level only**: the typed-path depth budget in segments, default `9`. Widens or narrows the `FieldPath` union for this form (`Form<TSchema, D>`); the runtime ignores it. Constrained to the `PathDepth` union (0–25), so an out-of-range literal or a `number`-typed variable fails to compile. Raising it costs compile time. See [Typed paths](../typed-paths#how-path-segments-are-interpreted) |

## `Form<TSchema>` methods

| Method | Notes |
|---|---|
| `schema` / `store` | the schema and the underlying zustand store (`getState` / `getInitialState` / `subscribe`) |
| `getState()` / `subscribe(listener)` | direct store access; `listener(state, prev)` fires on every change |
| `setValue(path, value)` | updates one field. Dirtiness is derived, not stored: a field reads as dirty while its value differs structurally from `initialValues` at that path (arrays and plain objects compare deep, Dates by timestamp, `Object.is` otherwise) |
| `setValues(next)` | replace the entire values object; server errors release only where a value slice actually changed |
| `setTouched(path, touched?)` | marks a path touched (default `true`) |
| `setSubmitting(value)` | manually set the `isSubmitting` flag |
| `setError(path, errors)` / `setErrors(map)` / `clearErrors(path?)` | the app-owned **server error channel** (`state.serverErrors`), which validation never touches. `setError` accepts a single string or an array; `clearErrors(path)` clears both channels at the path and its descendants (`clearErrors("")` clears just the root entry; `clearErrors()` clears everything); `setErrors` replaces the whole server channel |
| `setMode(mode)` / `setReValidateMode(mode)` | switch validation modes at runtime |
| `reset(nextInitial?, options?)` | reset to initial; takes optional partial overrides (shallow-merged for record roots, replaced wholesale otherwise) and [`ResetOptions`](#resetoptions). There is no `keepDirty`: dirtiness derives from values vs initial, and reset makes them equal |
| `resetField(path)` | reset one field to its initial value, clearing its (and its descendants') error and touched state. A path with no initial counterpart, such as an appended array row, keeps its value and only clears field state |
| `adoptValues(values)` | mid-session rebase. Replaces `values` and `initialValues`, and clears `errors` plus the in-flight validation flags (`isValidating`/`isValidatingForm`, since the rebase disowns in-flight passes), but **preserves** interaction state (`touched`, `submitCount`, `isSubmitting`, `mode`). Use `reset()` for a full wipe |
| `updateState(updater)` | atomic multi-field patch. `errors` is derived from `schemaErrors`/`serverErrors`, so patch the channels instead: the patch type omits `errors` entirely, and a plain-JS `errors` patch is warned about and ignored |
| `validate()` / `validateField(path)` / `validateFields(paths)` | sync validation. On an async schema all three transparently start the async pass instead and return `{ kind: "pending", promise }` |
| `validateAsync()` / `validateFieldAsync(path)` / `validateFieldsAsync(paths)` | async; supports `async .refine` |
| `submit(onValid, onInvalid?, { force? })` | full submit flow, returns `Promise<SubmitResult>`. Resolves `{ kind: "valid", data }`, `{ kind: "invalid", errors }` (errored fields are also marked touched), `{ kind: "skipped" }` when another submit is in flight and `force` isn't set, or `{ kind: "error", error }` when `onValid` throws or rejects. Submit resolves instead of rejecting, so `handleSubmit` never leaves an unhandled rejection |
| `handleSubmit(onValid, onInvalid?, options?)` | returns an event handler that calls `preventDefault()` and runs `submit` |
| `getField(path)` | typed one-shot value read |
| `getFieldState(path)` | typed one-shot read of a field's full slice, a [`FieldSnapshot`](#fieldsnapshot-tvalue) |
| `watchField(path, listener)` | subscribe to one field's [`FieldSnapshot`](#fieldsnapshot-tvalue); returns an unsubscribe function |
| `watchValue(path, listener)` | subscribe to one path's value (`Object.is`-compared); `listener(next, prev)` |
| `watchValues(listener)` | subscribe to the **whole values object**; `listener(values, prev)` fires on any value change. The name is `watchValue` plus "s" as in "all the values". It is not a multi-path `watchValue`; that would be a new API |
| `diff()` / `dirtyFields()` | PATCH-style helpers, derived by comparing `values` against `initialValues`: minimal divergent paths (objects recurse to the changed leaves; arrays report their base path). Reverting a field drops it |
| `snapshot()` / `restore(snap)` | full state capture and restore for undo or rollback. `restore` re-derives the merged `errors` map from the snapshot's channels, and clears the transient in-flight flags (`isValidating`/`isValidatingForm`) instead of restoring them, because in-flight state is owned by live passes, never by snapshots |
| `arrayPush(path, item)` / `arrayRemove(path, index)` / `arrayInsert(path, index, item)` / `arrayMove(path, from, to)` / `arraySwap(path, a, b)` | array ops with meta-key re-keying, so errors, touched flags, and server verdicts follow their rows. Out-of-range or non-integer indices are refused with a warning |

All paths on the imperative surface are `FieldPath`-typed; runtime-built strings need a cast. See [Typed paths](../typed-paths#dynamic-paths).

The positional `submit(onValid, onInvalid?, options?)` is the committed shape. No options-object overload is planned, so when you need options without an invalid handler, pass `undefined` in its slot:

```ts
await form.submit(onValid, undefined, { force: true });
```

## Result and option types

### `SubmitResult<TOutput>`

```ts
type SubmitResult<TOutput> =
  | { kind: "valid"; data: TOutput }      // validation passed, onValid ran to completion
  | { kind: "invalid"; errors: ErrorMap } // onInvalid ran, errors written, fields marked touched
  | { kind: "skipped" }                   // another submit was in flight and force wasn't set
  | { kind: "error"; error: unknown };    // onValid threw or rejected. Submit resolves with the
                                          // thrown value instead of rejecting; no error state is
                                          // written, so surface it yourself (e.g. via setError)
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

`SettledValidationResult` and `SettledFieldValidationResult` are the same unions without the `"pending"` arm.
