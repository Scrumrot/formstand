# Validation

This page covers when validation runs (modes and `reValidateMode`), the sync and async validation methods and their results, per-field debouncing, how field-scoped validation isolates a single field, and the guarantees that keep async results race-free. For where errors land and how they merge with server errors, see [Errors: schema & server](./errors).

## Modes

`mode` decides which interactions trigger validation before the first submit attempt. Submitting **always** validates, regardless of mode.

| `mode` | on change | on blur |
| --- | --- | --- |
| `"onChange"` | yes | no |
| `"onBlur"` (default) | no | yes |
| `"onSubmit"` | no | no |
| `"onTouched"` | only once the field is touched | yes |
| `"all"` | yes | yes |

Once a submit has been attempted (`submitCount > 0`), `reValidateMode` (default `"onChange"`) takes over — the common pattern of "quiet until submit, then live feedback" is the default behavior of `mode: "onBlur"` + `reValidateMode: "onChange"`.

```ts
const form = useForm(schema, {
  initialValues,
  mode: "onTouched",
  reValidateMode: "onChange",
});
```

Both can be switched at runtime with `form.setMode(mode)` and `form.setReValidateMode(mode)`.

### `validateOnMount`

The error map starts empty, so a never-validated form reads as valid — `useIsValid` reflects the error map, not a fresh parse. If you gate a submit button on validity, pass `validateOnMount: true` so the initial values are checked at creation (async schemas validate in the background):

```ts
const form = useForm(schema, { initialValues, validateOnMount: true });
```

::: warning
`validateOnMount` surfaces errors for untouched fields immediately. Gate error display on `touched` if you don't want messages shown before the user interacts. (Submitting re-validates regardless, so an invalid form can't be submitted either way.)
:::

## Sync validation

```ts
form.validate();               // whole form → ValidationResult
form.validateField("email");   // one field (and its descendants) → FieldValidationResult
form.validateFields(["email", "username"]); // several fields → boolean | Promise<boolean>
```

- `validate()` parses the whole form and replaces the schema-error channel wholesale. Returns `{ kind: "valid", data }` or `{ kind: "invalid", errors }`.
- `validateField(path)` validates one field, writing and clearing errors for the path **and its descendants** (`validateField("address")` also settles `"address.city"`). Returns `{ kind: "valid" }` or `{ kind: "invalid", errors: string[] }`.
- `validateFields(paths)` validates several paths in one pass and returns whether all of them are error-free.

### Pending results on async schemas

If the schema needs async parsing (an `async .refine` anywhere), the sync methods don't throw — they detect the async requirement, **start the async pass themselves**, and hand you the in-flight work:

```ts
const result = form.validate();
if (result.kind === "pending") {
  const settled = await result.promise; // { kind: "valid" | "invalid", ... }
}
```

`validate()` and `validateField()` return `{ kind: "pending", promise }`; `validateFields()` returns the `Promise<boolean>` itself. Check `result.kind` rather than assuming `valid`/`invalid` — or use the async variants directly when you know the schema is async.

Note the pending path is only taken when it must be: if the *field being validated* is itself sync, `validateField` settles synchronously even when other fields in the schema carry async refines (see field-scoped validation below).

## Async validation

```ts
await form.validateAsync();                    // whole form, supports async .refine
await form.validateFieldAsync("username");     // one field
await form.validateFieldsAsync(["a", "b"]);    // several → boolean
```

`form.submit` uses async parsing internally, so async refines work transparently on submit:

```ts
const schema = z.object({
  username: z.string().refine(
    async (v) => !(await isTaken(v)),
    { message: "taken" },
  ),
});
```

## Debounced per-field validation

For async checks that hit the network, debounce the validation `useField` triggers on change/blur:

```tsx
const username = useField(form, "username", { debounceMs: 300 });
```

With `debounceMs` set, each triggering interaction resets a timer; when it fires, the field runs `validateFieldAsync`. While a check is in flight, `username.isValidating` is `true` — useful for a "checking..." indicator:

```tsx
<span>
  {username.isValidating ? "checking..." : username.error?.[0]}
</span>
```

## How field-scoped validation works

`validateField` / `validateFieldAsync` avoid parsing the whole form when they can, choosing one of three strategies:

1. **Subschema extraction (the fast path).** When the path is reachable through plain `z.object` / `z.array` levels that carry no checks, the field's subschema is extracted (and cached per form) and parsed against just that field's value. This is what keeps an async username refine from firing while you type in an unrelated field.
2. **Full-parse fallback.** When a traversed level carries a refinement or is a wrapper (`optional`, `nullable`, `default`, `pipe`, `union`, `record`, ...), extraction could miss cross-field rules targeting the path — so the whole form is parsed and the resulting errors are **scoped** to the path and its descendants before being written.
3. **Skip.** When the path addresses no slot — an out-of-range array index — validation is skipped entirely, because parsing a subschema against `undefined` would fabricate an error no full-form parse produces.

`validateField("")` is a whole-form pass and behaves exactly like `validate()`.

## Race handling

Async validation is guarded on two axes, so out-of-order network responses can't corrupt the error map:

- **Per-path sequence counters.** Each async pass takes a sequence number for its path; a result only writes if it's still the latest pass for that path. A stale "username taken" response can't overwrite a newer "ok".
- **Values-reference guard.** Each pass records the `values` reference it validated. If `values` changed during the await (`setValue`, `reset`, `adoptValues`, ...), the write is dropped — the result describes values that no longer exist.

In-flight state is observable: field-level passes set `state.isValidating[path]` (surfaced as `useField(...).isValidating`), and whole-form async passes set the `state.isValidatingForm` boolean.

## Performance model

Field-scoped validation is **not** a CPU optimization. From the repo's benchmarks (`bench/README.md`, 50 string fields + nested object + 20 array rows): a full-form parse is ~6 µs when valid, ~30 µs with one invalid field — invisible next to a 16 ms frame, even per keystroke. The subschema fast path earns its complexity by validating a field in *isolation*: without it, any schema containing an async refine (a server-side uniqueness check, say) would fire that refine on every keystroke in **every** field. It also keeps per-keystroke cost flat as forms grow.

## Next

- [Errors: schema & server](./errors) — where validation results land, and how server errors coexist with them.
- [Form state & lifecycle](./state) — `isValidating`, `isValidatingForm`, and the rest of the state shape.
