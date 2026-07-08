# Form state & lifecycle

This page covers the `FormState` shape, derived dirtiness and the `diff()`/`dirtyFields()` helpers, touched semantics, snapshot/restore for undo and rollback, the difference between `reset` and `adoptValues`, atomic patches with `updateState`, non-React subscriptions, the flag hooks, and sharing a form through context.

## The `FormState` shape

The entire form lives in one zustand store of `FormState<z.input<TSchema>>`:

```ts
type FormState<TValues> = Readonly<{
  values: TValues;            // current values
  initialValues: TValues;     // the baseline dirtiness compares against
  errors: ErrorMap;           // DERIVED: merged view of the two channels below
  schemaErrors: ErrorMap;     // validation-owned channel
  serverErrors: ErrorMap;     // app-owned channel (setError/setErrors)
  touched: BoolMap;           // path → interacted
  isSubmitting: boolean;
  submitCount: number;        // incremented per submit attempt
  isValidating: BoolMap;      // path → async field validation in flight
  isValidatingForm: boolean;  // whole-form async validation in flight
  mode: ValidationMode;
  reValidateMode: ValidationMode;
}>;
```

`errors` is derived from the two channels — never write it directly; see [Errors: schema & server](./errors). There is deliberately **no dirty map**: dirtiness is computed, as described next.

## Dirtiness is derived

A field is dirty while its value differs *structurally* from `initialValues` at that path — arrays and plain objects compare deep, `Date`s compare by timestamp (re-picking the same date must not leave a field permanently dirty), everything else by `Object.is`. Because it's derived rather than tracked by writers, it can't drift: `arrayPush` followed by `arrayRemove` reads clean again, and `reset` is clean *by definition*.

Read it per field (`useField(...).dirty`, `form.getFieldState(path).dirty`), form-wide (`useIsDirty(form)`), or as a PATCH-style payload:

```ts
form.dirtyFields(); // minimal divergent paths, e.g. ["profile.name", "tags"]
form.diff();        // { "profile.name": "Ada", tags: ["a", "b"] }
```

Both compare `values` against `initialValues` and report **minimal divergent paths**: objects recurse to the changed leaves, arrays report their base path, and a divergent non-record root reports `""`. Reverting a field to its initial value drops it from both.

## Touched

`touched` is a plain path-keyed map of "the user has interacted with this field":

- `field.onBlur()` (wired by the bound components and prop builders) sets it, as does `form.setTouched(path, touched?)` (default `true`).
- A **failed submit marks every errored field touched**, so touched-gated error UIs show messages after the canonical first failed submit.
- The `"onTouched"` validation mode reads it — see [Validation](./validation#modes).

Touched is *stored*, not derived — clearing it is part of `reset`'s job.

## Snapshot and restore

`snapshot()` captures the full state; `restore(snap)` puts it back:

```ts
form.handleSubmit(async (data) => {
  const snap = form.snapshot();
  form.adoptValues(data);            // optimistic: data becomes the new baseline
  try {
    const saved = await api.save(data);
    form.adoptValues(saved);         // confirm with the server's response
  } catch {
    form.restore(snap);              // rollback
  }
});
```

`restore` re-derives the merged `errors` map from the snapshot's `schemaErrors`/`serverErrors` channels (defaulting missing channels for snapshots persisted under older shapes), so the errors-is-derived invariant holds even for hand-constructed snapshots.

## `reset` vs `adoptValues`

Two different contracts for replacing values:

| | `reset(nextInitial?, options?)` | `adoptValues(values)` |
| --- | --- | --- |
| `values` / `initialValues` | both set to the (merged) initial | both set to `values` |
| errors (both channels) | cleared, unless `keepErrors` | cleared |
| `touched` | cleared, unless `keepTouched` | **preserved** |
| `submitCount` | zeroed, unless `keepSubmitCount` | **preserved** |
| `isSubmitting` | cleared | **preserved** |
| `isValidating` / `isValidatingForm` | cleared | cleared (the rebase disowns in-flight passes, so their flags must not linger) |
| use case | "start over" | mid-session rebase (a save succeeded; the saved data is the new baseline) |

`reset`'s partial `nextInitial` is shallow-merged into the existing initial values when both are plain records, and replaces them wholesale otherwise (array- or scalar-rooted schemas). There's no `keepDirty` option because dirtiness derives from values vs initial — reset makes them equal, so everything reads clean by definition.

`resetField(path)` is the single-field version: the value returns to its initial slice, and error/touched/validating state at the path and its descendants is cleared.

## Atomic patches: `updateState`

When several slices must change in one store write (one render, one notification), use `updateState`:

```ts
form.updateState((state) => ({
  values: { ...state.values, status: "archived" },
  touched: { ...state.touched, status: true },
}));
```

The patch type omits `errors` — it's derived; patch `schemaErrors`/`serverErrors` instead and the merged map is recomputed. Note `updateState` is a raw patch: unlike `setValue`, it does not run the [server-error release contract](./errors#when-a-server-error-is-released) for you.

## Subscriptions outside React

```ts
form.subscribe((state, prev) => { ... });                   // every state change
form.watchValues((values, prev) => { ... });                // only when values change
form.watchValue("users.0.email", (next, prev) => { ... });  // one path's value
form.watchField("users.0.email", (snapshot) => { ... });    // value+error+touched+dirty+isValidating
```

All return an unsubscribe function. `watchValue` compares by `Object.is`; `watchField` fires when any part of the field's snapshot changes. `watchValues` watches the **whole values object** (the "s" means "all the values" — it is not a multi-path `watchValue`; to watch several specific paths, register a `watchValue` per path). A typical use is autosave:

```ts
const unsubscribe = form.watchValues((values) => scheduleAutosave(values));
```

## Flag hooks

```ts
useIsDirty(form);       // any field dirty (derived from values vs initialValues)
useIsValid(form);       // no errors currently in the merged map
useIsSubmitting(form);  // state.isSubmitting
useSubmitCount(form);   // state.submitCount
```

::: warning `useIsValid` reflects the error map, not a fresh validation
The error map is empty until validation runs, so a never-validated form reads as valid even if its initial values would fail the schema. If you gate a submit button on `!useIsValid(form)`, pass `validateOnMount: true` — see [Validation](./validation#validateonmount). Submitting always re-validates regardless, so an invalid form can't actually get through.
:::

## Sharing a form: `createFormContext`

`useForm` is per-component-instance — calling it twice gives two independent forms. To share one form down a deep tree without prop drilling, create a typed context per form shape:

```tsx
import { createFormContext, useField, useForm } from "formstand";

const { Provider, useFormContext } = createFormContext<typeof schema>();

const Parent = () => {
  const form = useForm(schema, { initialValues });
  return (
    <Provider form={form}>
      <NameField />
      <EmailField />
    </Provider>
  );
};

const NameField = () => {
  const form = useFormContext(); // typed Form<typeof schema>
  const name = useField(form, "name"); // path inference intact
  return <input {...textInputProps(name)} />;
};
```

The factory pattern (one `createFormContext` call per form shape) carries the schema's type through the context, so children keep full path inference. `useFormContext` throws when used outside its matching `Provider`. For small trees, just passing `form` as a prop works fine; for a single app-wide form, a module-scope `createForm` also works.

## Next

- [Errors: schema & server](./errors) — the two channels behind the derived `errors` map.
- [API reference](../api/) — the full method and type listing.
