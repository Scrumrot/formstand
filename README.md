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
});
```

### `Form<TSchema>` methods

| Method | Notes |
|---|---|
| `getState()` / `subscribe(listener)` | the underlying zustand store |
| `setValue(path, value)` | updates one field; marks it dirty |
| `setValues(next)` | replace the entire values object |
| `setTouched(path, touched?)` | marks a path touched |
| `setError(path, errors)` / `setErrors(map)` / `clearErrors(path?)` | error map control (server errors) |
| `setMode` / `setReValidateMode` | switch modes at runtime |
| `reset(nextInitial?)` | reset to initial; optional partial overrides |
| `adoptValues(values)` | new baseline: values + initialValues, clears errors/dirty |
| `updateState(updater)` | atomic multi-field patch |
| `validate()` / `validateField(path)` / `validateFields(paths)` | sync validation; sync-schema only |
| `validateAsync()` / `validateFieldAsync(path)` / `validateFieldsAsync(paths)` | async; supports `async .refine` |
| `submit(onValid, onInvalid?, { force? })` → `Promise<boolean>` | full submit flow; returns `true` if ran, `false` if skipped (in-flight) |
| `handleSubmit(onValid, onInvalid?)(event?)` | event handler wrapper that calls `preventDefault` |
| `getField(path)` | typed one-shot value read |
| `watchField` / `watchValue` / `watchValues` | subscriptions; see below |
| `diff()` / `dirtyFields()` | PATCH-style helpers |
| `snapshot()` / `restore(snap)` | full state capture/restore for undo/rollback |
| `arrayPush` / `arrayRemove` / `arrayInsert` / `arrayMove` / `arraySwap` | array ops with meta-key re-keying |

### Validation modes

- `mode: "onBlur"` (default): validate on blur and on submit.
- `mode: "onChange"`: validate on every change AND blur AND submit.
- `mode: "onSubmit"`: validate only on submit.
- `reValidateMode` (default `"onChange"`) kicks in once `submitCount > 0`.

For schemas with `async .refine`, the React layer transparently routes to async validation when sync would throw. Direct calls to sync `validate()` / `validateField()` will throw on async schemas; use the `*Async` variants.

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

### `useFormState(form, selector)` / `useFormStateShallow(form, selector)`

Selector-style subscription. Use `useFormStateShallow` for selectors that return objects/arrays.

### `useFormError(form)`

Shortcut for the root-level error (errors at the `""` key from a schema-level `.refine`).

### Flag hooks

```ts
useIsDirty(form);       // any field dirty
useIsValid(form);       // no errors currently
useIsSubmitting(form);
useSubmitCount(form);
```

### Bound input components

```tsx
<TextField form={form} path="email" label="Email" type="email" />
<NumberField form={form} path="age" label="Age" />
<CheckboxField form={form} path="agree" label="I agree" />
<SelectField form={form} path="theme" label="Theme"
  options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
```

Or roll your own with the prop helpers:

```tsx
<input {...textInputProps(useField(form, "name"))} />
<input {...numberInputProps(useField(form, "age"))} />
<input {...checkboxProps(useField(form, "agree"))} />
<select {...selectProps(useField(form, "theme"))}>...</select>
```

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
- `form.validateFieldAsync(path)` runs full-form parse but writes errors only for that path.
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

`useField`'s built-in validation triggers will clear server errors on the next blur/change. To make a server error sticky, set it after validation runs.

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
