# Layouts and modes

Four flags shape the file structure and the scaffold: `--layout`, `--sections`, `--columns`, and the pair `--live` / `--form-prop`. They compose freely, and every combination works with every `--ui`.

## Single file (default)

One `.tsx` file holding the schema import, `initialValues`, `useForm`, every control, and the submit handler. Kit adapters are inlined at the top of the file, so the output is self-contained and easy to paste, read, and edit.

```bash
npx formstand-gen src/profileSchema.ts --out src/ProfileForm.tsx
```

## Module layout

`--layout module` writes a feature folder instead, in the shape of the [Onboarding demo](../examples#onboarding-the-feature-module-layout):

```
ProfileForm/
  schema.ts        the zod schema (re-exported in zod mode, generated in type mode)
  types.ts         ProfileSchema / ProfileValues
  hooks.ts         createForm + createFormHooks(form, "profile"), the pre-wired hook API
  fields/          one file per scalar leaf: props type, field hook, component
  sections/        one per top-level object or array: props type, section hook with
                   path-scoped useProfileIsDirty / useProfileIsValid, component
  ProfileForm.tsx  the body composing sections and root-level fields
  index.ts         the folder's public API
```

```bash
npx formstand-gen src/profileSchema.ts --layout module --out src/ProfileForm
```

`--out` names the folder and creates it if missing. Every destination is checked before anything is written. Without `--out`, all files stream to stdout with `// --- file:` headers.

Kit modules get a shared adapter file rather than an inlined copy per file: `adapter.ts` for mui, chakra, and mantine (pure prop builders plus the number hook), `adapter.tsx` for shadcn and antd, whose `FieldError` components render JSX. Module layout requires formstand 0.7 or newer, for [`createFormHooks`](../state#pre-wired-hooks-createformhooks).

Reach for it when the form is big enough that a single file stops being pleasant to navigate, or when different people own different sections.

## Section chrome and columns

`--sections` picks how each nested object is framed, and `--columns` sets the field grid inside it. Both work with either layout, and each kit renders them in its own dialect.

| | `flat` (default) | `panel` | `collapsible` |
| --- | --- | --- | --- |
| `plain` | headings | bordered `<fieldset>` | `<details>` |
| `mui` | `Typography` | `Card` | `Accordion` |
| `shadcn` | headings | `bg-card` block | `<details>` |
| `chakra` | `Heading` | `Card.Root` | `Accordion.Root` |
| `mantine` | `Stack` + `Title` | `Card withBorder` | `Accordion` |
| `antd` | `Typography.Title` | `Card variant="outlined"` | `Collapse` (items API) |

`--columns 1|2|3` spaces fields evenly inside each section. Nested sections always span the full row.

## `--live`: forms with no submit

Some forms are not submitted at all. A search panel, a filter bar, or a map that redraws as you type wants the values continuously, not on a button press.

```bash
npx formstand-gen src/flightSearchSchema.ts --live --out src/FlightSearchForm.tsx
```

With `--live`:

- The submit scaffold is gone: no `handleSubmit`, no submit button, no `useIsSubmitting`.
- The component accepts an optional `onValuesChange?: (values) => void` prop, wired through `form.watchValues`.
- The emitted validation mode defaults to `"onChange"` rather than the library default `"onBlur"`, because a live consumer wants validity that tracks the values instead of lagging a blur behind them.
- The root element stays a `<form>` for the semantics (label association, the form landmark) with a `preventDefault` `onSubmit`, so the browser's implicit Enter-key submission can't navigate the page out from under you.

On formstand 0.13 or newer, [`useFormValues(form)`](../api/hooks#react-hooks) is the render-side one-liner for the same subscription.

## `--form-prop`: the page owns the form

By default the generated component calls `useForm` itself, which means the form instance is trapped inside it. `--form-prop` turns that inside out:

```bash
npx formstand-gen src/flightSearchSchema.ts --form-prop --out src/FlightSearchForm.tsx
```

- The component's props gain `form: Form<typeof schema>` and it stops calling `useForm`.
- The `useForm` scaffold is still emitted, as an exported `use{Name}Form()` hook that the page calls.

So one instance can feed the generated UI **and** everything else on the page: a map, an autosave effect, a summary panel, a wizard's step gate.

```tsx
const form = useFlightSearchForm();
const values = useFormValues(form);

return (
  <>
    <FlightSearchForm form={form} />
    <ResultsMap query={values} />
  </>
);
```

Combined with `--live`, the generated component becomes pure rendering and `onValuesChange` subscribes to the form you passed. The playground's [live + form prop demo](https://scrumrot.github.io/formstand/examples/#/gen-live) is exactly this shape.

::: warning `--form-prop` with `--layout module`
The module's field hooks are pre-wired to the singleton exported from `./hooks` (for example `profileForm`). The `form` prop only drives the component's shell, meaning submit and subscription, so **the prop must be that same singleton**.

Passing a different form of the same schema compiles but silently splits state: the shell reads your instance while every field keeps reading the module's own form. The generated component therefore warns in development whenever it renders with a form that isn't the module singleton.

If you need a per-mount instance instead of a singleton, use `--layout single` with `--form-prop`, or wire up `useForm` plus [`createFormContext`](../state#sharing-a-form-createformcontext) by hand.
:::
