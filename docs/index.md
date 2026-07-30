---
layout: home

hero:
  name: formstand
  text: Zod-schema-first forms for React
  tagline: Write the schema once. It gives you the types, the validation, the typed paths, and with formstand-cli, the component itself.
  image:
    src: /logo.svg
    alt: A form with a green check, resting on a music stand
  actions:
    - theme: brand
      text: Get started
      link: /documentation/getting-started
    - theme: alt
      text: Generate a form
      link: /documentation/cli/
    - theme: alt
      text: Live playground
      link: https://scrumrot.github.io/formstand/examples/

features:
  - icon:
      src: /icons/cli.svg
      width: 28
      height: 28
    title: The form writes itself
    details: "formstand-gen turns a zod schema or a TypeScript type into a working component: typed initial values, a bound control per field, array sections, accessible markup. One command, no runtime dependency."
    link: /documentation/cli/
    linkText: See what it generates
  - icon:
      src: /icons/kits.svg
      width: 28
      height: 28
    title: Six UI kits, one flag
    details: Plain HTML, Material UI 5 through 9, shadcn/ui, Chakra 3, Mantine 9, or Ant Design 6. Every backend is typechecked against the real kit declarations before release.
    link: /documentation/cli/ui-kits
    linkText: Compare the backends
  - icon:
      src: /icons/paths.svg
      width: 28
      height: 28
    title: Typed paths, end to end
    details: useField(form, "users.0.email") infers the value type from your schema. Writes are typed too, so a typo'd path or a wrong value type is a compile error.
  - icon:
      src: /icons/bolt.svg
      width: 28
      height: 28
    title: Per-field subscriptions
    details: Fields re-render only when their own slice changes. Field-scoped validation parses one field's subschema per keystroke instead of the whole form, async refines included.
  - icon:
      src: /icons/channels.svg
      width: 28
      height: 28
    title: Schema and server errors, separated
    details: Validation owns one channel, your app owns the other. A background validation pass physically cannot wipe a "username taken" server error.
  - icon:
      src: /icons/a11y.svg
      width: 28
      height: 28
    title: Accessible out of the box
    details: The bound components ship with aria-invalid, aria-describedby, role="alert", and focus-first-error. Field arrays keep stable row keys through reorders and removes.
---

## Schema in, form out

Point the generator at a schema you already have:

```bash
npx formstand-gen src/profileSchema.ts --ui mui --sections panel --columns 2 --out src/ProfileForm.tsx
```

It reads the schema with your own copy of zod, so the output matches what the schema actually says. Optional fields, nullable fields, enum options, defaults, and nested arrays all come through. What you get is a plain `.tsx` file with no markers and no regeneration magic: edit it, move it, delete the CLI. Nothing in the generated code imports from `formstand-cli`.

For anything bigger than a handful of fields, `--layout module` writes a feature folder instead of one file, with the schema, the pre-wired hooks, one file per field, and one per section.

[Read the CLI docs](/documentation/cli/) or [build a form in the browser](https://scrumrot.github.io/formstand/examples/#/schema-builder), where the same generator runs client-side.

## Or write it by hand

```tsx
const schema = z.object({ email: z.string().email(), age: z.number().min(18) });

export const SignupForm = () => {
  const form = useForm(schema, { initialValues: { email: "", age: 18 } });
  const email = useField(form, "email");

  return (
    <form onSubmit={form.handleSubmit(save)}>
      <input {...textInputProps(email)} />
      <span role="alert">{email.error?.[0]}</span>
    </form>
  );
};
```

No resolver to configure, no `register`, no coercion layer. Dirtiness is derived by comparing values against initial values rather than tracked, so it cannot drift, and `form.diff()` gives you a PATCH-ready payload of exactly what changed.

[Getting started](/documentation/getting-started) · [Typed paths](/documentation/typed-paths) · [Migrating from react-hook-form](/documentation/migrating-from-react-hook-form)
