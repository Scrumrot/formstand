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

Once a submit has been attempted (`submitCount > 0`), `reValidateMode` (default `"onChange"`) takes over. The common pattern of "quiet until submit, then live feedback" is what `mode: "onBlur"` plus `reValidateMode: "onChange"` already does.

```ts
const form = useForm(schema, {
  initialValues,
  mode: "onTouched",
  reValidateMode: "onChange",
});
```

Both can be switched at runtime with `form.setMode(mode)` and `form.setReValidateMode(mode)`.

### `validateOnMount`

The error map starts empty, so a never-validated form reads as valid: `useIsValid` reflects the error map, not a fresh parse. If you gate a submit button on validity, pass `validateOnMount: true` so the initial values are checked at creation (async schemas validate in the background):

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
form.validateFields(["email", "username"]); // several fields → FieldsValidationResult
```

- `validate()` parses the whole form and replaces the schema-error channel wholesale. Returns `{ kind: "valid", data }` or `{ kind: "invalid", errors }`.
- `validateField(path)` validates one field, writing and clearing errors for the path **and its descendants** (`validateField("address")` also settles `"address.city"`). Returns `{ kind: "valid" }` or `{ kind: "invalid", errors: string[] }`.
- `validateFields(paths)` validates several paths in one pass. Returns `{ kind: "valid" }` or `{ kind: "invalid", errors }`, where `errors` holds only the entries within the requested paths' scope.

### Pending results on async schemas

If the schema needs async parsing (an `async .refine` anywhere), the sync methods don't throw. They detect the async requirement, **start the async pass themselves**, and hand you the in-flight work:

```ts
const result = form.validate();
if (result.kind === "pending") {
  const settled = await result.promise; // { kind: "valid" | "invalid", ... }
}
```

All three sync methods return `{ kind: "pending", promise }` in that case, never a bare truthy `Promise` that would slip through an `if (form.validateFields(...))` gate. Check `result.kind` rather than assuming `valid` or `invalid`, or use the async variants directly when you know the schema is async.

Note the pending path is only taken when it must be: if the *field being validated* is itself sync, `validateField` settles synchronously even when other fields in the schema carry async refines (see field-scoped validation below).

## Async validation

```ts
await form.validateAsync();                    // whole form, supports async .refine
await form.validateFieldAsync("username");     // one field
await form.validateFieldsAsync(["a", "b"]);    // several → { kind: "valid" | "invalid" }
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

With `debounceMs` set, each triggering interaction resets a timer; when it fires, the field runs `validateFieldAsync`. While a check is in flight, `username.isValidating` is `true`, which is what a "checking..." indicator reads:

```tsx
<span>
  {username.isValidating ? "checking..." : username.firstError}
</span>
```

## How field-scoped validation works

`validateField` / `validateFieldAsync` avoid parsing the whole form when they can, choosing one of three strategies:

1. **Subschema extraction (the fast path).** When the path is reachable through plain `z.object` / `z.array` levels that carry no checks, the field's subschema is extracted (and cached per form) and parsed against just that field's value. This is what keeps an async username refine from firing while you type in an unrelated field.
2. **Full-parse fallback.** When a traversed level carries a refinement or is a wrapper (`optional`, `nullable`, `default`, `pipe`, `union`, `record`, and so on), extraction could miss cross-field rules targeting the path, so the whole form is parsed and the resulting errors are **scoped** to the path and its descendants before being written. This is what makes a cross-field `.superRefine` with a `path` behave like a field-local rule on the blamed field. See the [recipe](./recipes#cross-field-rules-that-blame-one-field).
3. **Skip.** When the path addresses no slot, such as an out-of-range array index, validation is skipped entirely, because parsing a subschema against `undefined` would fabricate an error no full-form parse produces.

`validateField("")` is a whole-form pass and behaves exactly like `validate()`.

The plural `validateFields` / `validateFieldsAsync` apply the same rule to a batch: when **every** requested path extracts a subschema, only those slots are parsed (the async pass parses them in parallel), and one path that falls back sends the whole batch through a single full parse scoped per path. This is what `useFormSteps` runs on each `next()`, so a wizard step pays for its own fields rather than the whole schema, and an async refine on a later step's field does not fire on an earlier step's advance.

## Race handling

Async validation is guarded on two axes, so out-of-order network responses can't corrupt the error map:

- **Per-path sequence counters.** Each async pass takes a sequence number for its path; a result only writes if it's still the latest pass for that path. A stale "username taken" response can't overwrite a newer "ok".
- **Stale-value guard.** Each pass records what it validated and drops its write if that is no longer the live value. A subschema pass compares its own **slot**: a `username` check keeps its verdict when you move on and type into `email` while it is in flight, and drops it only if `username` itself changed. A full-parse pass (an ancestor refine may read any field) compares the whole `values` reference, as do `reset` and `adoptValues`, which also release every in-flight pass's ownership.

In-flight state is observable: field-level passes set `state.isValidating[path]` (surfaced as `useField(...).isValidating`), and whole-form async passes set the `state.isValidatingForm` boolean. `useIsValidating(form)` reads both as one boolean-only subscription ("is anything checking right now" for a global spinner), and `useIsValidating(form, "shipping")` scopes it to a subtree, same prefix semantics as `useIsDirty`/`useIsValid`. `createFormHooks` exposes the bound `use{Name}IsValidating`.

## Performance model

Field-scoped validation is **not** a CPU optimization. From the repo's benchmarks (`bench/README.md`, 50 string fields plus a nested object and 20 array rows), a full-form parse costs about 6 µs when valid and about 30 µs with one invalid field, which is invisible next to a 16 ms frame even per keystroke. The subschema fast path earns its complexity by validating a field in *isolation*: without it, any schema containing an async refine, such as a server-side uniqueness check, would fire that refine on every keystroke in **every** field. It also keeps per-keystroke cost flat as forms grow.

## Security notes

Client-side validation is a user-experience feature. Three places where that distinction has teeth:

- **Re-validate on the server.** `handleSubmit`, `useFormAction`, and `useFormActionState` hand your handler data the schema has already accepted, but only the browser ran that parse. A server action is an endpoint any client can call with arbitrary arguments, so the server parses `data` with the same schema on every request; the client pass only shapes the hydrated experience. See [React 19 form actions](./ssr#react-19-form-actions).
- **Persisted drafts are untrusted input.** `persistForm` reads whatever sits under its storage key, applies the shape guard and `version` check, and adopts the result **without validating it**, so a draft that fails the schema loads with an empty error map. Anything with write access to that storage (another tab, an extension, a shared machine) can put values there. Call `form.validate()` after a draft loads when UI is gated on validity, and never treat loaded values as judged. See [Persistence](./state#persistence).
- **The CLI runs your modules.** `formstand-gen` loads the schema module and `formstand.config.ts` through jiti, which executes them, imports included. Point it only at files you would run with `node`, and treat a schema file from an untrusted source the way you would any script. See the CLI [quick start](./cli/quick-start#from-a-zod-schema) and [config page](./cli/config#project-defaults).

## Next

- [Errors: schema & server](./errors): where validation results land, and how server errors coexist with them.
- [Form state & lifecycle](./state): `isValidating`, `isValidatingForm`, and the rest of the state shape.
