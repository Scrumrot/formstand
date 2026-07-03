# zustand-forms

Zod-schema-first form state for React 19, backed by zustand.

- **Typed paths** — `useField(form, "users.0.email")` infers the value type from the schema.
- **Per-field subscriptions** — fields re-render only when their own slice changes.
- **Sync and async validation** — with race-handling for async refines.
- **Field arrays** with stable IDs that survive reorders.
- **Bound input components** for the common cases.

## Install

```bash
npm install zustand-forms zustand zod react
```

Peer-dep ranges: `zod ^4.2`, `zustand ^5.0`, `react ^19.0`.

## Quickstart

```tsx
import { z } from "zod";
import {
  TextField,
  NumberField,
  useForm,
  useIsSubmitting,
} from "zustand-forms";

const schema = z.object({
  name: z.string().min(2, "min 2 chars"),
  age: z.int().nonnegative(),
});

const SignUpForm = () => {
  const form = useForm(schema, {
    initialValues: { name: "", age: 0 },
    mode: "onBlur",
  });
  const submitting = useIsSubmitting(form);

  return (
    <form
      onSubmit={form.handleSubmit((data) => {
        console.log("submit", data);
      })}
    >
      <TextField form={form} path="name" label="Name" />
      <NumberField form={form} path="age" label="Age" />
      <button type="submit" disabled={submitting}>
        {submitting ? "..." : "Submit"}
      </button>
    </form>
  );
};
```

## Core API

### `createForm(schema, options)`

Creates a form instance. React users typically use `useForm` instead, which wraps this.

```ts
const form = createForm(schema, {
  initialValues,
  mode: "onBlur",          // "onChange" | "onBlur" | "onSubmit"
  reValidateMode: "onChange", // mode used after the first submit attempt
  validateOnMount: false,  // run a validation pass at creation (see below)
});
```

### `Form<TSchema>` methods

| Method | Notes |
|---|---|
| `getState()` / `subscribe(listener)` | the underlying zustand store |
| `setValue(path, value)` | updates one field. Dirtiness is derived, not stored: a field reads as dirty while its value differs structurally from `initialValues` at that path (arrays/plain objects compare deep, Dates by timestamp, `Object.is` otherwise) |
| `setValues(next)` | replace the entire values object; dirtiness is recomputed per top-level key against `initialValues` |
| `setTouched(path, touched?)` | marks a path touched |
| `setError(path, errors)` / `setErrors(map)` / `clearErrors(path?)` | error map control (server errors); `setError` accepts a single string or an array; `clearErrors(path)` also clears descendant keys (`clearErrors("")` clears just the root schema-level entry; `clearErrors()` clears everything); `setErrors` replaces the whole map |
| `setMode` / `setReValidateMode` | switch modes at runtime |
| `reset(nextInitial?, options?)` | reset to initial; optional partial overrides (shallow-merged for record roots, replaced wholesale otherwise) and `{ keepErrors, keepTouched, keepSubmitCount }` (no `keepDirty` — dirtiness derives from values vs initial, and reset makes them equal) |
| `resetField(path)` | reset one field to its initial value, clearing its (and descendants') error/touched state (dirtiness clears by definition — the value now equals initial) |
| `adoptValues(values)` | mid-session rebase: replaces `values` + `initialValues` and clears `errors`, but **preserves** interaction state (`touched`, `submitCount`, `isSubmitting`, `isValidating`, `mode`). Use `reset()` for a full wipe |
| `updateState(updater)` | atomic multi-field patch; error entries the patch adds or **changes by content** get the `setError` contract (marked manual) — re-writing identical content is treated as a clone and stays unmarked (use `setError`, or set `manualErrors` in the patch, to vouch for an unchanged entry) |
| `validate()` / `validateField(path)` / `validateFields(paths)` | sync validation; on an async schema they transparently start the async pass instead (`validate`/`validateField` return `{ kind: "pending", promise }`, `validateFields` returns the `Promise<boolean>` itself) |
| `validateAsync()` / `validateFieldAsync(path)` / `validateFieldsAsync(paths)` | async; supports `async .refine` |
| `submit(onValid, onInvalid?, { force? })` → `Promise<SubmitResult>` | full submit flow; resolves `{ kind: "valid", data }`, `{ kind: "invalid", errors }` (errored fields are also marked touched), or `{ kind: "skipped" }` when another submit is in flight |
| `handleSubmit(onValid, onInvalid?)(event?)` | event handler wrapper that calls `preventDefault` |
| `getField(path)` | typed one-shot value read |
| `getFieldState(path)` | typed one-shot read of a field's full slice (value/error/touched/dirty/isValidating) |
| `watchField` / `watchValue` / `watchValues` | subscriptions; see below |
| `diff()` / `dirtyFields()` | PATCH-style helpers, derived by comparing `values` against `initialValues`: minimal divergent paths (objects recurse to the changed leaves; arrays report their base path). Reverting a field drops it |
| `snapshot()` / `restore(snap)` | full state capture/restore for undo/rollback |
| `arrayPush` / `arrayRemove` / `arrayInsert` / `arrayMove` / `arraySwap` | array ops with meta-key re-keying; the array path's dirtiness is recomputed against `initialValues` (push + remove reverts to clean) |

### Validation modes

- `mode: "onBlur"` (default): validate on blur and on submit.
- `mode: "onChange"`: validate on every change and on submit (not on blur).
- `mode: "onSubmit"`: validate only on submit.
- `mode: "onTouched"`: validate on blur always; on change only once the field has been touched.
- `mode: "all"`: validate on every change and blur.
- `reValidateMode` (default `"onChange"`) kicks in once `submitCount > 0`.

For schemas with `async .refine`, sync `validate()` / `validateField()` / `validateFields()` no longer throw: they detect the async requirement, start the async pass themselves, and hand you the in-flight work (`{ kind: "pending", promise }` from `validate`/`validateField`; the `Promise<boolean>` itself from `validateFields`). If the *field being validated* is itself sync, `validateField` still settles synchronously even when other fields carry async refines — field validation parses just that field's subschema when it can (see below).

## React hooks

### `useForm(schema, options)`

Lazy-creates a `Form<TSchema>` and holds it for the component's lifetime. Stable reference across renders.

### `useField(form, path, options?)`

Subscribes to one field's slice (value/error/touched/dirty/isValidating) and returns helpers:

```ts
const name = useField(form, "name");
name.value;      // typed via FieldPath
name.error;      // readonly string[] | undefined
name.touched;
name.dirty;
name.isValidating;
name.setValue(v);
name.setTouched();
name.setError([...]);
name.clearError();
name.validate();
name.validateAsync();
name.onBlur();
```

Options:

```ts
useField(form, "username", { debounceMs: 300 }); // debounces validation
```

Path can also be a selector:

```ts
useField(form, (state) => `users.${state.values.selectedIdx}.email`);
```

### `useFieldArray(form, path)`

Array operations + stable IDs for React keys:

```ts
const users = useFieldArray<UserItem>(form, "users");
users.fields.map((f, i) => (
  <UserRow key={f.id} item={f.value} index={i} />
));
users.push({...});
users.remove(i);
users.move(from, to);
users.swap(a, b);
users.insert(i, item);
users.error;   // array-level error (e.g. min(1))
```

`fields` IDs are reconciled against item identity each render, so a row's `id`
stays glued to its item across reorders, inserts, and removes — including
mutations made outside this hook (`form.arrayMove`, `setValue`, `restore`, or a
second `useFieldArray` on the same path). Editing a field keeps its row's `id`
(the row updates instead of remounting); a genuinely new item gets a fresh `id`.
IDs reset when the hook's `path` changes.

### `useFormSelector(form, selector)` / `useFormSelectorShallow(form, selector)`

Selector-style subscription. Use `useFormSelectorShallow` for selectors that return objects/arrays.

> Formerly `useFormState` / `useFormStateShallow` — renamed because React DOM
> ships its own (deprecated) `useFormState` and auto-imports regularly grabbed
> the wrong one. The old names still work as deprecated aliases.

### `useFormError(form)`

Shortcut for the root-level error (errors at the `""` key from a schema-level `.refine`).

### Flag hooks

```ts
useIsDirty(form);       // any field dirty
useIsValid(form);       // no errors currently in the error map
useIsSubmitting(form);
useSubmitCount(form);
```

> **`useIsValid` reflects the error map, not a fresh validation.** It returns
> `true` when no errors are currently recorded — covering both schema errors and
> server errors set via `setError`. But the error map is empty until validation
> runs, so a never-validated form reads as valid even if its initial values
> would fail the schema. If you gate a submit button on `!useIsValid(form)`,
> pass `validateOnMount: true` to `useForm`/`createForm` so the initial values
> are checked up front. (`submit`/`handleSubmit` always re-validate regardless,
> so an invalid form can't actually be submitted either way.) `validateOnMount`
> surfaces errors for untouched fields immediately — gate error display on
> `touched` if you don't want them shown before interaction.

### Bound input components

```tsx
<TextField form={form} path="email" label="Email" type="email" />
<NumberField form={form} path="age" label="Age" />
<CheckboxField form={form} path="agree" label="I agree" />
<SelectField form={form} path="theme" label="Theme" placeholder="Pick a theme"
  options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
```

All bound components ship with accessibility wiring: `name={path}` (autofill,
password managers, native form posts), `aria-invalid` while errored,
`aria-describedby` pointing at the error message, and the error rendered with
`role="alert"` so it's announced when it appears. Each also accepts a `ref`
to the underlying `<input>`/`<select>`.

`SelectField` stays controlled while the field value is `undefined` by rendering
a disabled empty option (with your `placeholder` text, if given), so the blank
state is visible instead of the browser silently showing the first option.

`NumberField` renders a `type="text"` input with `inputMode="decimal"` and keeps
the raw text while you type, so partial entries (`-`, `1.`, `1e`) survive instead
of being coerced away by a controlled `<input type="number">`. Each keystroke
that parses to a **finite** number is pushed to the form (whitespace counts as
empty → `undefined`; `Infinity` is rejected), and the display snaps to the
canonical value on blur. If something else writes the field while you're typing
(`reset`, `adoptValues`, another component), the external value wins and the
input updates immediately.

Or roll your own with the prop helpers:

```tsx
<input {...textInputProps(useField(form, "name"))} />
<input {...checkboxProps(useField(form, "agree"))} />
<select {...selectProps(useField(form, "theme"))}>...</select>
```

`numberInputProps` is also exported as a stateless `<input type="number">` binding
(native stepper + `step`), at the cost of the intermediate-entry behaviour above:

```tsx
<input {...numberInputProps(useField(form, "age"))} type="number" step="1" />
```

### Focus management

`focusFirstError(errors, root?)` focuses the first control (in DOM order) whose
`name` matches an errored path — the bound components set `name={path}` so this
works out of the box. Wire it into the invalid-submit handler:

```tsx
<form onSubmit={form.handleSubmit(onValid, (errors) => focusFirstError(errors))}>
```

For custom focus logic, every bound component also takes a `ref` to its input.

## Sharing a form across components

`useForm(schema, options)` creates a form bound to the calling component's lifetime. Calling `useForm` twice — even with the same schema — gives you **two independent forms with two independent stores**. The hook uses `useState(() => createForm(...))` under the hood, and `useState` is per-component-instance.

To share one form between components, use one of these patterns:

### 1. Lift the form up and pass it down as a prop

```tsx
const Parent = () => {
  const form = useForm(schema, { initialValues });
  return (
    <>
      <NameField form={form} />
      <EmailField form={form} />
    </>
  );
};
```

Each child takes `form: FieldFormApi` (or the typed `Form<typeof schema>`) and calls `useField(form, "...")` on it. Works for small trees; gets noisy if the tree is deep.

### 2. `createFormContext` — no prop drilling, full typing

```tsx
import { createFormContext } from "zustand-forms";

const { Provider, useFormContext } = createFormContext<typeof schema>();

const Parent = () => {
  const form = useForm(schema, { initialValues });
  return (
    <Provider form={form}>
      <NameField />
      <EmailField />
    </Provider>
  );
};

// In NameField.tsx — no form prop:
const NameField = () => {
  const form = useFormContext();          // typed Form<typeof schema>
  const name = useField(form, "name");
  return <input {...textInputProps(name)} />;
};
```

The factory pattern (one `createFormContext` per form shape) preserves the schema's type information through the context. Children can `useField` directly without losing path inference.

### 3. Module-scope `createForm` (rare)

```ts
// formStore.ts
export const profileForm = createForm(schema, { initialValues });
```

Import and use anywhere. The form lives for the lifetime of the module — useful for single-instance "app-wide" forms (e.g., a global filter bar), bad for forms that should reset between page mounts.

## Common pitfalls

- **Object-returning selectors must use `useFormSelectorShallow`.** `useFormSelector(form, (s) => ({ values: s.values, errors: s.errors }))` returns a fresh object on every call; React's `useSyncExternalStore` will detect snapshot churn and bail with *"Maximum update depth exceeded"*. Use `useFormSelectorShallow` instead — it caches by shallow equality.
- **Synchronous `validate` / `validateField` return `pending` on async schemas.** They start the async pass for you and return `{ kind: "pending", promise }` — check `result.kind` (or use the `*Async` variants directly) rather than assuming `valid`/`invalid`.
- **`form.submit()` short-circuits when one is already in flight** — it resolves `{ kind: "skipped" }`. Pass `{ force: true }` as the third argument to bypass.
- **`z.coerce.*` collapses typed paths.** Form values are typed as `z.input<Schema>`, and in zod v4 the input of `z.coerce.number()` is `unknown` — so `FieldPath`/`FieldValue` can't see through it and path inference degrades for those fields. Prefer keeping the field's input type honest (e.g. `z.string()` in the schema and parse in a `.transform`/`.pipe`, or use `NumberField`, which parses text to `number` for you) over `z.coerce`.
- **The imperative write surface is typed.** `form.setValue("naem", "x")` and `form.setValue("age", "thirty")` are compile errors, as are `setTouched`/`setError`/`clearErrors`/`validateField(s)`/array ops with bad paths. Dynamic array paths still typecheck (`` `users.${i}.email` `` with `i: number` matches the template-literal path type); for a fully runtime-built string, cast: `form.setValue(path as FieldPath<z.input<typeof schema>>, value as never)`.

## Path semantics

Paths are dot-separated (`"users.0.email"`). How a segment is interpreted is
decided by the **existing container**: arrays take numeric segments as indices,
plain objects take any segment as a string key — so a `z.record` keyed `"0"`
reads and writes the record key instead of silently becoming an array. Only
when the container doesn't exist yet does the segment type pick what's created
(numeric → array, otherwise object). Two limitations: keys containing `.` are
not addressable, and array writes beyond index 100 000 are refused (a typo'd
index must not allocate gigabytes).

## Subscriptions (non-React)

```ts
form.subscribe((state, prev) => { ... });                  // fires on every state change
form.watchValues((values, prev) => { ... });               // only on values changes
form.watchValue("users.0.email", (next, prev) => { ... }); // single path's value
form.watchField("users.0.email", (snapshot) => { ... });   // value + error + touched + dirty + isValidating
```

All return an unsubscribe function.

## Async validation

```ts
const schema = z.object({
  username: z.string().refine(
    async (v) => !(await isTaken(v)),
    { message: "taken" },
  ),
});
```

- `form.submit` uses `safeParseAsync` internally, so async refines work transparently.
- `form.validateFieldAsync(path)` parses **just that field's subschema** when the path is reachable through refinement-free objects/arrays — so an async username check doesn't fire when you validate an unrelated field. When a traversed level carries a refinement (cross-field rules), it falls back to a full-form parse and scopes the written errors to the path and its descendants.
- `validateField("address")` also **sets and clears errors for descendant paths** (`address.city`, …), not just the exact key.
- Per-path **sequence numbers** ensure stale "username was taken" results don't overwrite a newer "ok" result.
- A **values-reference guard** drops the write if `values` mutated during the await (so `reset`/`adoptValues`/`setValue` during an in-flight validate doesn't corrupt the error map).

For UI, prefer `useField(form, path, { debounceMs: 300 })` to throttle network traffic.

## Server-side errors

```ts
form.handleSubmit(async (data) => {
  const res = await api.create(data);
  if (!res.ok) {
    for (const err of res.errors) {
      // setError's path is typed; a server-provided string needs a cast
      form.setError(err.field as FieldPath<z.input<typeof schema>>, [err.message]);
    }
  }
});
```

Errors set via `setError`/`setErrors` (or an `errors` patch through `updateState`) are tracked as **manual** errors — the marks live in `FormState.manualErrors`, so `snapshot`/`restore` carry them and array ops re-key them alongside the errors themselves. Manual errors survive full-form validation passes the schema is silent on — a background `validateAsync()` resolving no longer wipes a "username taken" message. A manual error is released when:

- the field's value changes (`setValue` on the path or an ancestor/descendant — editing `address.street` releases a verdict on `address`),
- an array op changes the array a mark sits on (marks on individual rows follow their rows instead),
- a field-scoped validation (`validateField`/`validateFieldAsync`) targets its path (`validateField("")` counts as a full pass and preserves them, like `validate()`),
- a schema error lands on the same key (the schema message wins), or
- you call `clearErrors` / `reset` / `adoptValues`.

Note `submit` still proceeds when the schema is valid even if manual errors are present (the server gets to re-judge); they simply remain in the error map, so `useIsValid` stays `false` until the user edits the field.

## Field arrays with nested arrays

Both work — `arrayPush("users.0.tags", tag)` mutates the inner array; outer reorders correctly re-key meta for all nested paths. `useFieldArray`'s stable IDs reset when the hook's path changes (so an inner field array inside a reordered outer item gets fresh IDs).

## Optimistic UI

```ts
form.handleSubmit(async (data) => {
  const snap = form.snapshot();
  form.adoptValues(data); // optimistic: data becomes the new baseline
  try {
    const saved = await api.save(data);
    form.adoptValues(saved); // confirm with server response
  } catch (e) {
    form.restore(snap); // rollback
  }
});
```

## License

MIT
