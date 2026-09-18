# Testing forms

This page covers `formstand/testing`: driving a form in tests the way the hooks drive it — mode-gated validation included — without mounting components, and where component-level testing still earns its render cost.

## Why not just `form.setValue`?

`form.setValue` is the imperative API: deliberately **validation-silent**, like every imperative write. A rendered input validates through `useField`'s change and blur gates (`mode`, `reValidateMode`, submit state). A test that writes with `setValue` and then wonders where the error is has not found a bug — it has skipped the gate. And a test that re-derives the gates by hand carries mode semantics it should not have to know.

`formstand/testing` restates the hooks' own recipes over the core API:

```ts
import { fillField, blurField, fillAndBlurField, fillFields, submitForm } from "formstand/testing";

const form = createForm(schema, { initialValues });

fillAndBlurField(form, "email", "nope");        // edit + leave, like a user
expect(form.getState().errors["email"]).toEqual(["not an email"]);

fillFields(form, { email: "tim@example.com", age: 44 });
const result = await submitForm(form);
if (result.kind === "valid") {
  expect(result.data.age).toBe(44);              // parsed z.output
}
```

- **`fillField(form, path, value)`** — a user edit: write, then validate under the **change** gate, exactly `useField`'s `setValue` (the no-op guard included: writing the identical value skips the gate too). The value is typed from the path.
- **`blurField(form, path)`** — mark touched, then validate under the **blur** gate, exactly `useField`'s `onBlur`.
- **`fillAndBlurField(form, path, value)`** — edit-then-leave; what touched-gated error UIs respond to.
- **`fillFields(form, values)`** — a fixture object applied in order, each entry through the full fill recipe.
- **`submitForm(form)`** — submit with a no-op handler and hand back the `SubmitResult`: `"valid"` carries parsed data, `"invalid"` the error map (written and marked touched like any failed submit). Switch on `kind`; the discriminant does the shape-assertion work.

Everything is framework-agnostic: plain state in, plain data out; your runner's assertions do the judging.

## What still deserves a render

These helpers test **form behavior**: validation flow, error state, submit outcomes. They deliberately do not simulate the DOM. What a *component* contributes — that clearing a text input writes the field's `emptyValue`, that `aria-invalid` follows the error, that a select's blank option is selectable exactly when the field is [clearable](./components#empty-values-null-vs-undefined) — is the binding's job, and the library's own suite already pins it. Test your components for what *they* add: which fields render for which state, what your error UI shows, where focus goes. For that, render with Testing Library and interact through the DOM; the store-level helpers stay useful for arranging state quickly before the render.

## Next

- [Validation](./validation): the gates these helpers respect.
- [Form state & lifecycle](./state): reading state in assertions — `diff()`, `dirtyFields()`, `snapshot()`.
