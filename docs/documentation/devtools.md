# Devtools

A form-aware debugging panel you drop next to a form. It shows every field's value, error, and flags, keeps the two error channels visibly separate, renders the live diff against initial values, and gives you snapshot and restore for time travel.

```tsx
import { FormstandDevtools } from "formstand/devtools";

const Page = () => {
  const form = useForm(schema, { initialValues });
  return (
    <>
      <SignupForm form={form} />
      <FormstandDevtools form={form} />
    </>
  );
};
```

It ships in the `formstand` package as a subpath, so there is nothing extra to install and no version to keep in step with the library. **It renders nothing in production builds**, on the same `NODE_ENV` gate the store's devtools option uses, so leaving it mounted will not leak your form state into a shipped page.

## What it shows

**Fields.** One row per addressable leaf path, with the value, any error, and the `touched` / `dirty` / `validating` flags. Dirtiness comes from `getFieldState`, so the panel reports the library's own comparison rules (Dates by timestamp, deep for containers) rather than a second opinion that could disagree with `useIsDirty`.

**Errors without a field.** The root `""` key from a schema-wide `.refine`, array-level messages like `z.array().min(1)` keyed at the container, and server verdicts written at a path that holds no value yet. These are the errors that are hardest to find, because no input on the page is showing them.

**Error channels.** How many entries each channel holds, and for every server error, whether it is currently visible or sitting behind a schema message at the same key. The Redux DevTools extension does receive `schemaErrors` and `serverErrors`, since they are top-level state, but it shows them as two more maps in a blob; the relationship between them, which is the part you actually need, is left for you to work out by eye. See [Errors](./errors) for the model.

**Diff vs initial.** `form.diff()`, the PATCH-shaped payload of exactly what changed. Reads `clean` when nothing has.

**Time travel.** `snapshot` holds the full state; `restore` puts it back. Both are the public `snapshot()` and `restore()` methods, so anything you can do here you can also do from code.

## Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `form` | `Form<TSchema>` | required | the form to inspect |
| `position` | `"bottom-right" \| "bottom-left" \| "top-right" \| "top-left"` | `"bottom-right"` | which corner the panel anchors to |
| `defaultOpen` | `boolean` | `false` | start expanded instead of as a toggle button |
| `label` | `string` | `"formstand"` | shown on the toggle, for telling two mounted panels apart |

Mount one per form. The toggle shows an error count when the form has any, so a collapsed panel still tells you something is wrong.

Styling is inline and self-contained. There is no stylesheet to import, and nothing in your app's CSS can restyle the panel into lying to you.

## Compared with the Redux DevTools option

`createForm` also accepts `devtools: true`, which wires the store to the [Redux DevTools browser extension](./state#redux-devtools). The two answer different questions and can both be on at once.

| | `formstand/devtools` | `devtools: true` |
| --- | --- | --- |
| Needs a browser extension | no | yes |
| Form semantics (per-field rows, channel relationship) | yes | no, raw state only |
| Action log across every store in the app | no | yes |
| Lives in your component tree | yes | no |

Reach for the panel when the question is "what is this form doing"; reach for the extension when the question is "what happened, in what order, across my whole app".
