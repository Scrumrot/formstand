# formstand-cli

`formstand-cli` writes the form for you. Point it at a zod schema or a TypeScript type and it prints a complete, compiling React component: typed `initialValues`, one bound control per field, sections for nested objects, `useFieldArray` blocks with add and remove buttons for lists, and a wired submit.

```bash
npm install -D formstand-cli          # the binary is named formstand-gen
npx formstand-gen src/profileSchema.ts --out src/ProfileForm.tsx
```

It is a one-shot generator. The file it writes is yours: no markers, no regeneration magic, no runtime dependency added to your app. `formstand-cli` is a dev dependency that produces code and then gets out of the way.

## Why use it

You already wrote the shape, the optionality, the enum options, and the validation rules once, in zod. The generator reads that same schema and binds it, which is the whole point: the form cannot disagree with the contract it validates against, because there is only one description of the data.

What it saves you is the boring 80% that is also easy to get subtly wrong. Blank values matching each field's kind (`""`, `false`, `null` for nullables, `[]` for arrays). `aria-invalid` and `aria-describedby` on every control. Stable row keys on array items. A submit handler that already calls `preventDefault`. None of that is hard, and all of it is tedious enough that it drifts.

The same schema emits plain formstand components, Material UI, shadcn/ui, Chakra, Mantine, or Ant Design; only [`--ui`](./ui-kits) changes. Every backend is typechecked against the real declarations of each supported major before a release ships, so the output compiles against the kit you actually have installed.

It also scales past the point where writing forms by hand stops being fun. A 40-field schema with three nested sections and two array levels is one command, and [module layout](./layouts#module-layout) turns it into a feature folder with a file per field and per section rather than a 600-line component.

Coding agents get an outsized win here. An agent that would otherwise spend thousands of tokens emitting a form can run one deterministic command instead and get output that already compiles, with flags standing in for the choices it would otherwise have to guess.

There is no lock-in to worry about, either. Generated output imports nothing from `formstand-cli`, so you can delete the tool and keep the code.

## A minute-long tour

```ts
// src/contactSchema.ts
export const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().nullable(),
  role: z.enum(["admin", "user"]),
  tags: z.array(z.object({ label: z.string() })),
});
```

```bash
npx formstand-gen src/contactSchema.ts --ui mui --sections panel --columns 2 --out src/ContactForm.tsx
```

You get a `ContactForm` with a MUI `TextField` per string, a number binding for `age` that keeps partial entries like `85000.` visible while you type, a `Select` carrying the enum's options, a `tags` section backed by `useFieldArray`, and two-column bordered panels around each section. `age` starts at `null`, because the schema says nullable.

## Where to next

| Page | What's on it |
| --- | --- |
| [Quick start](./quick-start) | both input modes, output destinations, watch mode |
| [UI kits](./ui-kits) | the six backends, supported majors, what each one needs from your app |
| [Layouts and modes](./layouts) | single file vs feature module, section chrome, `--live`, `--form-prop` |
| [Config and overrides](./config) | project defaults, and swapping a field's control by path |
| [Custom templates](./templates) | targeting a design system formstand doesn't ship |
| [Programmatic API](./programmatic) | the same generator as a library, browser-safe |
| [Command reference](./reference) | every flag, the supported schema surface, and how unsupported shapes degrade |
