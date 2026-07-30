# formstand

[![CI](https://github.com/Scrumrot/formstand/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Scrumrot/formstand/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/formstand)](https://www.npmjs.com/package/formstand) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Scrumrot/formstand/blob/main/LICENSE)

Zod-schema-first form state for React 19, backed by zustand.

**[Documentation](https://scrumrot.github.io/formstand/documentation/)** · **[Live playground](https://scrumrot.github.io/formstand/examples/)** · **[CLI](https://scrumrot.github.io/formstand/documentation/cli/)** · **[API reference](https://scrumrot.github.io/formstand/documentation/api/)**

- **Typed paths**: `useField(form, "users.0.email")` infers the value type from the schema. Writes are typed too, so a typo'd path is a compile error.
- **Per-field subscriptions**: fields re-render only when their own slice changes, and validation parses one field's subschema per keystroke instead of the whole form.
- **Two error channels**: validation owns one, your app owns the other, so a background pass cannot wipe a server message.
- **Field arrays** with stable IDs that survive reorders, inserts, and removes.
- **Bound input components** with the accessibility wiring already done.
- **A generator**: [`formstand-cli`](https://scrumrot.github.io/formstand/documentation/cli/) writes the whole component from your schema, for six UI kits.

## Install

```bash
npm install formstand zustand zod react
```

Peer-dep ranges: `zod ^4.2`, `zustand ^5.0`, `react ^19.0`.

## Quickstart

```tsx
import { z } from "zod";
import { TextField, NumberField, useForm, useIsSubmitting } from "formstand";

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
    <form onSubmit={form.handleSubmit((data) => console.log("submit", data))}>
      <TextField form={form} path="name" label="Name" />
      <NumberField form={form} path="age" label="Age" />
      <button type="submit" disabled={submitting}>
        {submitting ? "..." : "Submit"}
      </button>
    </form>
  );
};
```

`handleSubmit` calls `preventDefault` for you and only runs your handler with parsed,
`z.output`-typed data. The bound components render the label, wire the accessibility
attributes, and show the field's error.

Prefer your own markup? Every binding is also a plain function over a `useField` result:

```tsx
<input {...textInputProps(useField(form, "name"))} />
```

## Or generate the whole thing

[`formstand-cli`](https://scrumrot.github.io/formstand/documentation/cli/) writes the
component from a schema you already have. It is a dev dependency that produces plain
code and adds nothing to your bundle.

```bash
npm install -D formstand-cli
npx formstand-gen src/profileSchema.ts --ui mui --sections panel --columns 2 --out src/ProfileForm.tsx
```

You get typed `initialValues`, a bound control per field, sections for nested objects,
`useFieldArray` blocks with add and remove buttons, and a wired submit. Point it at a
TypeScript type instead (`--type Profile`) and it generates the zod schema too. `--ui`
targets plain formstand components, Material UI 5 through 9, shadcn/ui, Chakra 3,
Mantine 9, or Ant Design 6.

Try it without installing anything in the
[Schema builder](https://scrumrot.github.io/formstand/examples/#/schema-builder), which
runs the real emitters in your browser.

## How it works

Your zod schema is the single source of truth. It defines the value types, the set of
addressable paths, and the validation rules, and `useForm` builds a form whose entire
state lives in one plain zustand store. Hooks subscribe to slices of that store, so a
field re-renders only when its own slice changes. Because the store is ordinary zustand,
everything works outside React too: read it, subscribe to it, or drive it imperatively.

Errors live in two channels that cannot clobber each other. Validation owns
`schemaErrors` and rebuilds it on every pass; your `setError` calls own `serverErrors`
and validation never touches them. The map your UI reads is derived from both. That is
why a background `validateAsync()` cannot wipe a "username already taken" message, and
why the server verdict is released automatically when the user edits that field, with no
`clearErrors` bookkeeping in your change handlers.

Anything that can be derived is. Dirtiness is computed by comparing values against
initial values rather than tracked as you write, so it cannot drift out of sync,
`arrayPush` followed by `arrayRemove` reads clean again, and `diff()` gives you a
PATCH-ready payload of exactly what changed.

## The API, at a glance

| Area | What's there | Docs |
| --- | --- | --- |
| Form instance | `createForm`, `setValue`/`setValues`, `reset`/`resetField`/`adoptValues`, `submit`/`handleSubmit`, `diff`/`dirtyFields`, `snapshot`/`restore`, array ops | [createForm & Form](https://scrumrot.github.io/formstand/documentation/api/) |
| Hooks | `useForm`, `useField`, `useFieldArray`, `useVariantField`, `useFormSelector`, `useFormValues`, the flag hooks, `createFormContext`, `createFormHooks` | [Hooks](https://scrumrot.github.io/formstand/documentation/api/hooks) |
| Components | `TextField`, `NumberField`, `DateField`, `CheckboxField`, `SelectField`, the prop builders, `useNumberInput`, `focusField`/`focusFirstError` | [Components & bindings](https://scrumrot.github.io/formstand/documentation/api/components) |
| Validation | five modes plus `reValidateMode`, field-scoped passes, async refines with race handling, per-field `debounceMs` | [Validation](https://scrumrot.github.io/formstand/documentation/validation) |
| Utilities | `parsePath`/`getAtPath`/`setAtPath`, `validateSync`/`validateAsync`, `persistForm`, and the full type list | [Utilities & types](https://scrumrot.github.io/formstand/documentation/api/utilities) |

Coming from react-hook-form? The
[migration guide](https://scrumrot.github.io/formstand/documentation/migrating-from-react-hook-form)
maps `register`, `watch`, `setError`, `setFocus`, and `useFieldArray` onto their
counterparts, and is honest about what has none.

## Things that catch people out

- **Object-returning selectors need `useFormSelectorShallow`.** A selector returning a
  fresh object every call makes React bail with *"Maximum update depth exceeded"*.
- **`useIsValid` reflects the error map, not a fresh parse.** A never-validated form
  reads as valid. Pass `validateOnMount: true` if you gate a submit button on it.
- **Sync `validate`/`validateField` return `{ kind: "pending" }` on async schemas.**
  They start the async pass for you, so check `result.kind` rather than assuming.
- **`z.coerce.*` collapses typed paths**, because in zod v4 its input type is `unknown`.
  Keep the input type honest and parse in a `.transform`/`.pipe`, or use `NumberField`.
- **Explicit type arguments are a compile error** on a schema-typed form. The value type
  infers from the path; `useField<Values>(form, "email")` fails on purpose, with a
  message telling you to drop it.

Each of these is covered properly in the
[documentation](https://scrumrot.github.io/formstand/documentation/).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Note the repo has three independent npm roots
(`.`, `examples/`, `cli/`), and the root test suite needs `examples/` installed. Where
the project is headed lives in [ROADMAP.md](./ROADMAP.md).

## License

MIT
