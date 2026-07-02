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
| `setValue(path, value)` | updates one field; marks it dirty, or clears dirty if the value equals `initialValues` at that path (structural equality for arrays/plain objects, `Object.is` otherwise) |
| `setValues(next)` | replace the entire values object; dirtiness is recomputed per top-level key against `initialValues` |
| `setTouched(path, touched?)` | marks a path touched |
| `setError(path, errors)` / `setErrors(map)` / `clearErrors(path?)` | error map control (server errors) |
| `setMode` / `setReValidateMode` | switch modes at runtime |
| `reset(nextInitial?)` | reset to initial; optional partial overrides |
| `adoptValues(values)` | mid-session rebase: replaces `values` + `initialValues` and clears `errors`/`dirty`, but **preserves** interaction state (`touched`, `submitCount`, `isSubmitting`, `isValidating`, `mode`). Use `reset()` for a full wipe |
| `updateState(updater)` | atomic multi-field patch |
| `validate()` / `validateField(path)` / `validateFields(paths)` | sync validation; on an async schema they transparently start the async pass instead (`validate`/`validateField` return `{ kind: "pending", promise }`, `validateFields` returns the `Promise<boolean>` itself) |
| `validateAsync()` / `validateFieldAsync(path)` / `validateFieldsAsync(paths)` | async; supports `async .refine` |
| `submit(onValid, onInvalid?, { force? })` → `Promise<boolean>` | full submit flow; returns `true` if ran, `false` if skipped (in-flight) |
| `handleSubmit(onValid, onInvalid?)(event?)` | event handler wrapper that calls `preventDefault` |
| `getField(path)` | typed one-shot value read |
| `watchField` / `watchValue` / `watchValues` | subscriptions; see below |
| `diff()` / `dirtyFields()` | PATCH-style helpers; reflect only fields whose value currently differs from initial (reverting a field drops it) |
| `snapshot()` / `restore(snap)` | full state capture/restore for undo/rollback |
| `arrayPush` / `arrayRemove` / `arrayInsert` / `arrayMove` / `arraySwap` | array ops with meta-key re-keying; the array path's dirtiness is recomputed against `initialValues` (push + remove reverts to clean) |

### Validation modes

- `mode: "onBlur"` (default): validate on blur and on submit.
- `mode: "onChange"`: validate on every change AND blur AND submit.
- `mode: "onSubmit"`: validate only on submit.
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

### `useFormState(form, selector)` / `useFormStateShallow(form, selector)`

Selector-style subscription. Use `useFormStateShallow` for selectors that return objects/arrays.

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

`SelectField` stays controlled while the field value is `undefined` by rendering
a disabled empty option (with your `placeholder` text, if given), so the blank
state is visible instead of the browser silently showing the first option.

`NumberField` renders a `type="text"` input with `inputMode="decimal"` and keeps
the raw text while you type, so partial entries (`-`, `1.`, `1e`) survive instead
of being coerced away by a controlled `<input type="number">`. It parses to a
`number` for the form on each keystroke and snaps the display to the canonical
value on blur.

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

- **Object-returning selectors must use `useFormStateShallow`.** `useFormState(form, (s) => ({ values: s.values, errors: s.errors }))` returns a fresh object on every call; React's `useSyncExternalStore` will detect snapshot churn and bail with *"Maximum update depth exceeded"*. Use `useFormStateShallow` instead — it caches by shallow equality.
- **Synchronous `validate` / `validateField` return `pending` on async schemas.** They start the async pass for you and return `{ kind: "pending", promise }` — check `result.kind` (or use the `*Async` variants directly) rather than assuming `valid`/`invalid`.
- **`form.submit()` short-circuits when one is already in flight.** Pass `{ force: true }` as the third argument to bypass.
- **Typed paths exist on hooks, not imperative form methods.** `useField(form, "naem")` errors at compile time; `form.setValue("naem", "x")` does not. Use `useField`/`useFieldArray`/`form.getField`/`form.watchField`/`form.watchValue` for typo-catching paths.

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
      form.setError(err.field, [err.message]);
    }
  }
});
```

Errors set via `setError`/`setErrors` are tracked as **manual** errors and survive full-form validation passes the schema is silent on — a background `validateAsync()` resolving no longer wipes a "username taken" message. A manual error is released when:

- the field's value changes (`setValue` on the path or an ancestor/descendant),
- a field-scoped validation (`validateField`/`validateFieldAsync`) targets its path,
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
