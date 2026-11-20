---
name: formstand
description: Write React 19 forms with formstand, the zod-schema-first form library on zustand, and generate them with formstand-cli. Use when a project depends on formstand or formstand-cli, when asked to build a form from a zod schema, or when porting a react-hook-form form. Covers useForm, typed paths, useField and the bound components, field arrays, the two error channels, submit, wizards, and the generator's flags, plus the mistakes an assistant trained on other form libraries makes here.
---

# formstand

formstand is form state for React 19 where the zod schema is the source of truth. The schema gives the value types, the validation, the set of typed field paths, and enough shape for `formstand-cli` to write the component. State lives in one plain zustand store per form, so everything the hooks do is also available imperatively.

Versions this skill describes: formstand 0.26, formstand-cli 0.26, zod 4, zustand 5, React 19. Peer dependencies: `zod ^4.2`, `zustand ^5.0`, `react ^19.0`. zod is not swappable: there is no resolver layer, no Standard Schema adapter, and no `register`.

```bash
npm install formstand zod zustand
npm install -D formstand-cli   # optional, the binary is formstand-gen
```

Imports: `formstand` (everything below), `formstand/devtools` (the panel), `formstand/testing` (store-level test drivers). Nothing else is public.

## The model in five lines

1. `useForm(schema, { initialValues })` creates the form once and keeps it for the component's lifetime. `initialValues` is required and typed as `z.input<Schema>`.
2. Every path-taking call is typed against the schema: `useField(form, "users.0.email")` infers `string`, a typo is a compile error, and template paths like `` `users.${i}.email` `` typecheck.
3. Fields re-render only when their own slice changes. Validation parses one field's subschema per keystroke when it can.
4. Errors live in two channels: validation owns `schemaErrors`, your app owns `serverErrors` (`setError`, `addErrors`), and `state.errors` is their merge. A validation pass can never wipe a server message, and a server message is released when the user edits that field.
5. Dirtiness is derived by comparing values with initial values, never stored. `reset()` is clean by definition; `adoptValues()` rebases the baseline mid-session.

## The shapes to write

### A form with the bound components

```tsx
import { z } from "zod";
import { TextField, NumberField, SelectField, CheckboxField, useForm, useIsSubmitting } from "formstand";

const schema = z.object({
  name: z.string().min(2, "min 2 chars"),
  age: z.int().nonnegative(),
  role: z.enum(["admin", "user"]),
  agree: z.boolean(),
});

export const SignUpForm = () => {
  const form = useForm(schema, {
    initialValues: { name: "", age: 0, role: "user", agree: false },
    mode: "onBlur",
  });
  const submitting = useIsSubmitting(form);

  return (
    <form onSubmit={form.handleSubmit((data) => save(data))}>
      <TextField form={form} path="name" label="Name" />
      <NumberField form={form} path="age" label="Age" />
      <SelectField form={form} path="role" label="Role" options={[{ value: "admin", label: "Admin" }, { value: "user", label: "User" }]} />
      <CheckboxField form={form} path="agree" label="I agree" />
      <button type="submit" disabled={submitting}>Submit</button>
    </form>
  );
};
```

`handleSubmit` calls `preventDefault`, runs a full validation pass (async refines included) and calls your handler with `z.output`-typed data only when the schema passes. The five components (`TextField`, `NumberField`, `DateField`, `CheckboxField`, `SelectField`) render the label, `name={path}`, `aria-invalid`, `aria-describedby` and the first error with `role="alert"`, inside `div.zf-field` with `span.zf-error`. Their `path` prop is typed by value: `TextField` only accepts string-valued paths, `NumberField` number-valued, and so on.

### Custom markup

```tsx
import { useField, textInputProps, numberInputProps, checkboxProps, selectProps } from "formstand";

const name = useField(form, "name");          // value, error, firstError, touched, dirty, isValidating, setValue, onBlur, setError, clearError
<input {...textInputProps(name)} />
{name.touched ? <span>{name.firstError}</span> : null}
```

The builders spread `name`, the controlled `value` or `checked`, `aria-invalid`, `onChange` and `onBlur`. For a number input that must keep partial text like `-` or `1.` visible, use `NumberField` or `useNumberInput(field)`; `numberInputProps` is the stateless `type="number"` binding. A reusable field component must be generic over the value type (`<T extends string | null | undefined>({ field }: { field: UseFieldReturn<T> })`), never typed as `UseFieldReturn<string>`, or every `z.enum` field is rejected.

### Reading state

```tsx
useFormSelector(form, (s) => s.submitCount);                       // any slice, identity-compared
useFormSelectorShallow(form, (s) => ({ v: s.values, e: s.errors })); // REQUIRED for object or array returns
useFormValues(form);                                               // the whole values object
useIsValid(form); useIsDirty(form, "shipping"); useIsValidating(form); useFormError(form); // the root "" error
form.getState().values; form.getField("name"); form.watchValue("name", (next, prev) => {});
```

### Field arrays

```tsx
const users = useFieldArray(form, "users");   // path must be a variable-length z.array; item type inferred

{users.fields.map((row, i) => (
  <UserRow key={row.id} form={form} index={i} onRemove={users.remove} />   // row.id is the React key
))}
{users.firstError ? <p role="alert">{users.firstError}</p> : null}        // the array-level error (min, max)
<button type="button" onClick={() => users.push({ email: "", name: "" })}>Add</button>
```

Render each row from its own component that takes `form` and `index` and binds with ``useField(form, `users.${index}.email`)``, so a keystroke re-renders one row, not the list. Ops: `push`, `remove`, `insert`, `move`, `swap`, `prepend`, `update`, `replace`, `clear`. Errors, touched flags and server verdicts follow their rows through reorders.

### Server errors and submit outcomes

```tsx
form.handleSubmit(
  async (data) => {
    const res = await api.create(data);
    if (!res.ok) form.addErrors(Object.fromEntries(res.errors.map((e) => [e.field, [e.message]])));
  },
  undefined,
  { onError: () => form.setError("", "Could not save. Try again.") },
);
```

`setError(path, message | messages)`, `setErrors(map)` (replaces the server channel), `addErrors(map)` (merges, runtime-keyed, no casts), `clearErrors(path?)` (clears both channels at and under the path). Root-level messages, from a schema `.refine` or a form-wide server failure, live at the `""` key and are read with `useFormError(form)`. `form.submit` resolves a `SubmitResult`: `{ kind: "valid", data }`, `{ kind: "invalid", errors }`, `{ kind: "skipped" }` (a submit was in flight) or `{ kind: "error", error }` (your handler threw; nothing is written, so surface it through `onError`).

### Discriminated unions

```tsx
const method = useField(form, "payment.method");                   // the discriminant is a common key
const card = useVariantField(form, "payment", "cardNumber");        // variant-only field, typed string | undefined
{method.value === "card" ? <input {...textInputProps(card)} /> : null}
```

Call `useVariantField` unconditionally and gate the rendering on the discriminant. An array inside one variant binds with `useVariantFieldArray(form, "payment", "lines")`.

### Wizards

```tsx
const STEPS = [{ name: "account", fields: ["email", "password"] }, { name: "address", fields: ["shipping"] }] as const; // module level
const wizard = useFormSteps(form, STEPS);
// wizard.step, wizard.next() (validates the step, marks errored fields touched), wizard.back(), wizard.goTo(i), wizard.steps[i].hasErrors
```

One form, one schema, one `useForm`; the steps only decide what renders. A container path in `fields` covers its subtree.

## Rules that prevent the usual mistakes

- **No `register`, `control`, `Controller`, `zodResolver` or `defaultValues`.** Bind with the components, the prop builders or `useField`. The option is `initialValues`, and it is required.
- **No explicit type arguments on a schema-typed form.** `useField<string>(form, "email")` selects the schema-less overload and fails to compile with a message saying so. The path infers the type.
- **Default `mode` is `"onBlur"`, not `"onSubmit"`.** `"onChange"` validates on change only; use `"all"` for change and blur. After the first submit attempt `reValidateMode` (default `"onChange"`) takes over.
- **Selectors that return objects need `useFormSelectorShallow`.** The identity-compared `useFormSelector` loops with "Maximum update depth exceeded" on a fresh object per call.
- **`useForm` locks schema and options on first render.** Data that arrives later goes in with `form.adoptValues(values)` (rebase, keeps touched and submitCount) or `form.reset(values)` (start over). There is no `values` prop and no `keepDirty`.
- **Never write `state.errors`.** It is derived. Patch `schemaErrors` or `serverErrors` through `updateState`, or use `setError` and friends.
- **Do not use `z.coerce`.** Its input type is `unknown`, which collapses path inference for the field and often its siblings. Model numbers as `z.number()` and let `NumberField` parse the text.
- **`useFieldArray` paths must be variable-length arrays.** A scalar or `z.tuple` path is a compile error. Use `row.id` as the key, never the index.
- **Validation results are discriminated unions.** `validate()` and `validateField()` return `{ kind: "valid" | "invalid" }`, or `{ kind: "pending", promise }` when the schema has an async refine. Switch on `kind`; never truthiness-test the result.
- **Gating a button on `useIsValid` needs `validateOnMount: true`.** A never-validated form has an empty error map and reads valid.
- **Nothing auto-focuses on a failed submit.** Call `focusFirstError(errors, formElement)` in `onInvalid`. `focusField(path)` is the imperative sibling (what `setFocus` was).
- **Hoist `STEPS` and other array literals out of the component.** `useFormSteps` memoizes on the array's identity.
- **Clearing writes `field.emptyValue`.** `.nullable()` clears to `null`, `.optional()` to `undefined`, and a required string cleared stays `""`. `field.clearable` says whether the schema accepts the empty value.
- **Keys with dots are not addressable, and typed paths stop at 9 segments** (`pathDepth` on `createForm` widens it, type-level only). A runtime-built path string needs a cast to `FieldPath<z.input<typeof schema>>` at the boundary.
- **The hooks are React 19 only, and components are function components with hooks.** Server actions: `useFormAction(form, onValid)` for `<form action>`, `useFormActionState(form, action, initialState)` for `useActionState`; always re-parse on the server with the same schema.
- **Dates are calendar dates.** `DateField`, `dateToInputText` and `parseDateText` work in local time; never go through `toISOString()` for a date-only field.

## Generating a form instead of writing one

When a zod schema, a TypeScript type, or a JSON Schema / OpenAPI document exists, run the generator rather than emitting the component by hand. The output compiles, carries typed `initialValues`, one bound control per field, sections for nested objects, `useFieldArray` blocks (tables for arrays of flat object rows), discriminated unions on `useVariantField`, and a wired submit. It imports nothing from the CLI.

```bash
npx formstand-gen src/profileSchema.ts --out src/ProfileForm.tsx                        # zod export (default export, or the sole schema export, or --export NAME)
npx formstand-gen src/types.ts --type Profile --out src/ProfileForm.tsx --schema-out src/profileSchema.ts   # TypeScript type, schema generated too
npx formstand-gen api.json --schema Order --out src/OrderForm.tsx                       # JSON Schema or OpenAPI
npx formstand-gen src/profileSchema.ts --ui mui --layout module --sections panel --columns 2 --out src/profile   # a feature folder
npx formstand-gen src/profileSchema.ts --json                                           # one JSON document on stdout, for scripts and agents
npx formstand-gen --manifest                                                            # the generator described as data
```

Flags worth knowing: `--ui plain|mui[@5|6|7|9]|shadcn|chakra|mantine|antd`, `--layout single|module`, `--sections flat|panel|collapsible`, `--columns 1|2|3`, `--live` (values subscription, no submit), `--form-prop` (the page owns the form), `--tests vitest|jest|playwright`, `--watch`, `--force` (writes are all-or-nothing otherwise), `--template FILE` for a design system the CLI does not ship, `--path-depth N`. Project defaults live in `formstand.config.ts` (`defineConfig`), including per-path control overrides under `fields`. The CLI executes the schema module through jiti, so point it only at files you would run with node. Unsupported shapes degrade to a text field with a `// TODO` naming what was skipped; the file still compiles.

## Testing

`formstand/testing` exports `fillField`, `blurField`, `fillAndBlurField`, `fillFields` and `submitForm`: store-level drivers that go through the same mode gates the hooks use, so a test can exercise validation and submit without rendering. Component tests render the bound components and assert through labels and `aria-invalid`.

## Where to read more

The docs are published as plain markdown. Start at https://scrumrot.github.io/formstand/llms.txt (the index, one line per page) or fetch https://scrumrot.github.io/formstand/llms-full.txt for everything in one file. Pages an agent most often needs:

- https://scrumrot.github.io/formstand/documentation/api/index.md for every `Form` method and option type
- https://scrumrot.github.io/formstand/documentation/api/hooks.md for every hook's signature and return shape
- https://scrumrot.github.io/formstand/documentation/errors.md for the two-channel error contract and when a server error is released
- https://scrumrot.github.io/formstand/documentation/field-arrays.md for row ids, nested arrays and variant arrays
- https://scrumrot.github.io/formstand/documentation/migrating-from-react-hook-form.md for the name-by-name mapping
- https://scrumrot.github.io/formstand/documentation/cli/reference.md for every generator flag and how unsupported shapes degrade
