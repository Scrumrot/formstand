# Getting started

This page covers installing formstand, building your first form, the mental model behind the library, and the three ways to read form state. By the end you'll know where each piece lives and which page to read next.

## Install

```bash
npm install formstand zustand zod react
```

formstand declares `zod`, `zustand`, and `react` as peer dependencies. The supported ranges are `zod ^4.2`, `zustand ^5.0`, and `react ^19.0`.

## Quickstart

Define a zod schema, hand it to `useForm`, and wire fields by path:

```tsx
import { z } from "zod";
import {
  TextField,
  NumberField,
  useForm,
  useIsSubmitting,
} from "formstand";

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
        console.log("submit", data); // data is z.output<typeof schema>
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

That's a complete working form: `mode: "onBlur"` validates each field when you leave it, `handleSubmit` runs a full validation pass (calling `preventDefault` for you) and only calls your handler with typed, parsed data when the schema passes. The bound components render labels, wire accessibility attributes, and show the field's error message — see [Bound components](./components).

`useForm` creates the form lazily on first render and holds the same instance for the component's lifetime. Schema and options are locked in at that point; to load values that arrive later (e.g. from a fetch), call `form.adoptValues(values)` or `form.reset(values)` rather than changing the options.

## The mental model

Your zod schema is the single source of truth: it defines the value types, the set of addressable field paths, and the validation rules. `createForm(schema, options)` — which `useForm` wraps — builds a form instance whose entire state lives in one plain zustand store. React hooks like `useField` subscribe to slices of that store, so each field re-renders only when its own slice changes. Validation parses your values with the schema and writes an error map keyed by dot paths (`"users.0.email"`). Because the store is ordinary zustand, everything also works outside React: read it, subscribe to it, or drive it from imperative code.

## Reading state three ways

### 1. `useField` — one field's slice

Subscribes to a single path's value, error, touched, dirty, and validating state, plus write helpers:

```tsx
import { useField, textInputProps } from "formstand";

const NameInput = ({ form }: { form: Form<typeof schema> }) => {
  const name = useField(form, "name");
  return (
    <>
      <input {...textInputProps(name)} />
      {name.touched && name.error ? <span>{name.error[0]}</span> : null}
    </>
  );
};
```

The path is typed against the schema, and `name.value` is inferred as `string` — see [Typed paths](./typed-paths).

### 2. `useFormSelector` — any derived slice

Selector-style subscription over the whole `FormState`:

```tsx
import { useFormSelector, useFormSelectorShallow } from "formstand";

const submitCount = useFormSelector(form, (s) => s.submitCount);
const pair = useFormSelectorShallow(form, (s) => ({
  values: s.values,
  errors: s.errors,
}));
```

::: warning Object-returning selectors need the shallow variant
`useFormSelector` compares snapshots by identity. A selector that builds a fresh object every call makes React's `useSyncExternalStore` detect snapshot churn and bail with *"Maximum update depth exceeded"*. Use `useFormSelectorShallow` for selectors that return objects or arrays.
:::

### 3. `getState` and watchers — outside React

The form exposes the store directly for one-shot reads and non-React subscriptions:

```ts
form.getState().values;                                    // one-shot read
form.getField("name");                                     // typed one-shot value read
form.subscribe((state, prev) => { /* every change */ });
form.watchValues((values, prev) => { /* values changed */ });
form.watchValue("name", (next, prev) => { /* one path changed */ });
form.watchField("name", (snap) => { /* value+error+touched+dirty+isValidating */ });
```

All subscription functions return an unsubscribe function. See [Form state & lifecycle](./state) for the full state shape.

## Where to go next

- [Typed paths](./typed-paths) — how path inference works for reads and writes.
- [Validation](./validation) — modes, sync/async, debouncing, race handling.
- [Errors: schema & server](./errors) — the two error channels and how they merge.
- [Bound components](./components) — `TextField` and friends, or build your own with the prop builders.
- [Field arrays](./field-arrays) — lists with stable React keys.
- [Form state & lifecycle](./state) — dirtiness, snapshots, reset vs adopt, subscriptions.
- [API reference](../api/) — every method, hook, and exported type.
