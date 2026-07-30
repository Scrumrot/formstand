# Introduction

formstand is form state for React 19, built on zustand, where your zod schema is the source of truth. The schema you already wrote gives you the value types, the validation, the typed field paths, and enough shape information to generate the form itself.

Two packages:

- **`formstand`** is the library: `useForm`, typed field paths, per-field subscriptions, field arrays, and a small set of accessible bound components.
- **`formstand-cli`** is the generator: point it at that same schema and it writes the component. It is a dev dependency that adds nothing to your bundle.

```bash
npm install formstand zod zustand
npm install -D formstand-cli   # optional, generates forms from your schemas
```

## The idea in one form

```tsx
const schema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
});

export const SignupForm = () => {
  const form = useForm(schema, { initialValues: { email: "", age: 18 } });
  const email = useField(form, "email");

  return (
    <form onSubmit={form.handleSubmit(save)}>
      <input {...textInputProps(email)} />
      {email.error?.[0]}
    </form>
  );
};
```

`useField(form, "email")` knows `email` is a string, and knows that `"emial"` isn't a path at all. Nothing is registered, nothing is coerced, and only the components that read a field re-render when it changes.

## What makes it different

The schema is not a plugin here. There is no resolver layer to configure, because formstand reads the zod schema directly. That is what lets it infer paths, validate one field's subschema per keystroke, and know that a nullable field clears to `null` while an optional one clears to `undefined`.

Errors live in two channels that cannot clobber each other. Validation owns one, your app owns the other, so a background revalidation pass physically cannot wipe the "username taken" message your server just returned. [Errors](./errors) covers the full contract.

Wherever state can be derived, it is. Dirtiness is computed by comparing values against initial values rather than tracked as you write, so it cannot drift out of sync, and `diff()` hands you a PATCH-ready payload of exactly what changed.

And the generator speaks the same schema. [`formstand-cli`](./cli/) turns a schema, or a TypeScript type, into a working component for plain HTML, Material UI, shadcn/ui, Chakra, Mantine, or Ant Design.

## Where to start

**New here?** [Getting started](./getting-started) installs the library and builds a first form, then [Typed paths](./typed-paths) explains the piece that makes the rest click.

**Coming from react-hook-form?** [The migration guide](./migrating-from-react-hook-form) maps every API you already know, including `register`, `watch`, `setError`, `setFocus`, and `useFieldArray`.

**Have a schema and want the form now?** Go straight to [formstand-cli](./cli/), or try the [Schema builder](https://scrumrot.github.io/formstand/examples/#/schema-builder), which runs the real generator in your browser.

**Looking for a specific signature?** The [API reference](./api/) lists every method, hook, component, and type.
