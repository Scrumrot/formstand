# Recipes

Short, self-contained patterns for the situations every real form eventually hits. Each one is a condensed version of a working demo in the repo's `examples/` app — run `npm run examples` to see them live.

## Server errors on submit

Map a failed request onto fields with `setError`; the [server channel](./errors) keeps the message alive through background validation and releases it when the user edits the field.

```tsx
const onSubmit = form.handleSubmit(async (data) => {
  const res = await api.createUser(data);
  if (!res.ok) {
    // e.g. { username: "already taken" }
    Object.entries(res.fieldErrors).forEach(([path, message]) =>
      form.setError(path as FieldPath<Values>, message),
    );
    focusFirstError(form.getState().errors);
  }
});
```

## Autosave a draft

Persist values on a debounce with `watchValues`; restore them as `initialValues` on mount so dirtiness is measured against the draft.

```tsx
useEffect(() => {
  const timer: { current: ReturnType<typeof setTimeout> | null } = {
    current: null,
  };
  const unsub = form.watchValues((next) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => localStorage.setItem(KEY, JSON.stringify(next)),
      800,
    );
  });
  return () => {
    if (timer.current !== null) clearTimeout(timer.current);
    unsub();
  };
}, [form]);
```

`form.dirtyFields()` tells you what changed since the restored draft, and `form.diff()` is the matching PATCH payload.

## Multi-step wizard

Gate each step on just its own fields with `validateFields` — untouched steps stay unvalidated.

```tsx
const STEP_FIELDS = [
  ["name", "email"],
  ["address.street", "address.city"],
  ["plan", "terms"],
] as const;

const next = async () => {
  const ok = await form.validateFields(STEP_FIELDS[step]);
  if (ok) setStep((s) => s + 1);
};
```

`validateFields` returns `boolean` for sync schemas and a `Promise<boolean>` when async refines are involved — `await` covers both.

## Optimistic update with rollback

`snapshot()` before the request, `restore()` on failure — server errors and all.

```tsx
const save = async () => {
  const snap = form.snapshot();
  render(optimisticallyFrom(form.getState().values));
  const res = await api.save(form.getState().values);
  if (!res.ok) form.restore(snap);
};
```

## Dependent and derived fields

React to one field from another with `watchValue`, or compute a derived value in a selector so it's never stored at all.

```tsx
// Clear the state field whenever the country changes:
useEffect(
  () =>
    form.watchValue("country", () => form.setValue("state", "")),
  [form],
);

// Derived value — always consistent, nothing to sync:
const total = useFormSelector(form, (s) =>
  s.values.items.reduce((sum, i) => sum + i.qty * i.price, 0),
);
```

## Sharing a form without prop drilling

`createFormContext` gives you a typed provider/hook pair — paths stay schema-checked through the context.

```tsx
const { Provider, useFormContext } = createFormContext<typeof schema>();

const Parent = () => {
  const form = useForm(schema, { initialValues });
  return (
    <Provider form={form}>
      <DeeplyNestedField />
    </Provider>
  );
};

const DeeplyNestedField = () => {
  const form = useFormContext();
  const email = useField(form, "email"); // still typed
  return <input {...textInputProps(email)} />;
};
```

## Rebase after save

After a successful save, the just-saved values become the new baseline — `adoptValues` swaps `values` and `initialValues` without wiping interaction state, so the form reads clean but `touched`/`submitCount` survive.

```tsx
await api.save(form.getState().values);
form.adoptValues(form.getState().values);
// useIsDirty() is now false; touched and submitCount are preserved.
```

Use [`reset()`](./state#reset-vs-adoptvalues) instead when you want a full wipe.
