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
    // On a multi-form page, pass your <form> element (e.g. via a ref) so the
    // search — and the root-error fallback — stays inside this form:
    // focusFirstError(form.getState().errors, formRef.current ?? undefined)
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
  const result = await form.validateFieldsAsync(STEP_FIELDS[step]);
  if (result.kind === "valid") setStep((s) => s + 1);
};
```

For a known-sync schema, `form.validateFields(STEP_FIELDS[step]).kind === "valid"` settles synchronously; on an async schema `validateFields` returns `{ kind: "pending", promise }` instead, so the always-async variant above is the simplest gate that covers both.

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

## One store, many forms

The pattern that motivated the [`pathDepth`](./typed-paths#how-path-segments-are-interpreted) option: one module-level store backs several forms, each editing a namespaced slice — so leaf paths pick up the namespace segments and can sit past the default 9-segment typed-path budget. Widen the budget once, at `createForm`, and export per-slice hooks with `createFormHooks`:

```ts
// appStore.ts — one schema, namespaced per feature
const appSchema = z.object({
  settings: z.object({
    profile: z.object({
      contact: z.object({
        address: z.object({
          geo: z.object({
            coords: z.object({
              lat: z.object({ value: z.number(), precision: z.number() }),
            }),
          }),
        }),
      }),
    }),
  }),
  billing: z.object({ plan: z.enum(["free", "pro"]) }),
});

// "settings.profile.contact.address.geo.coords.lat.value" is 8 segments
// here — one more wrapper and the default budget of 9 runs out. Widen once:
export const appForm = createForm(appSchema, {
  initialValues,
  pathDepth: 12, // one literal in 0–25; `number` variables and unions error
});

// Per-slice hook APIs, all sharing the one store. D rides along, so the
// deep paths stay fully typed in every bound hook.
export const { useSettingsField, useSettingsIsDirty } =
  createFormHooks(appForm, "settings");
export const { useBillingField } = createFormHooks(appForm, "billing");
```

```tsx
// A slice component binds through its own hooks — no form prop anywhere.
const LatitudeField = () => {
  const lat = useSettingsField(
    "settings.profile.contact.address.geo.coords.lat.value",
  );
  return <input {...numberInputProps(lat)} />;
};
```

Two wrinkles to know about:

- **The budget is part of the form's type.** `Form<typeof appSchema, 12>` is deliberately not assignable to `Form<typeof appSchema>` (or vice versa), so any prop or helper that takes this form must say `Form<typeof appSchema, 12>`.
- **Context can't infer it.** `createFormContext` takes no value argument, so a widened form's context names the budget explicitly: `createFormContext<typeof appSchema, 12>()`. Forgetting it produces a `Form<S, 12> is not assignable to Form<S, 9>` error at the `<Provider form={...}>` site — the mismatch is caught, never silently widened. The explicit `D` position enforces the same 0–25 constraint as the option: `createFormContext<S, 26>()` or a widened `number` argument is a compile error.

## Focus a field imperatively

`focusField(path, root?)` is `focusFirstError`'s path-keyed sibling (and the equivalent of react-hook-form's `setFocus`): it focuses the first control in DOM order whose `name` is the path or a descendant of it, with the same focusability rules. The classic uses are landing focus after appending an array row, or when a dialog opens:

```tsx
import { focusField } from "formstand";

const addUser = () => {
  const index = users.length;
  users.push({ email: "" });
  // The new row's input doesn't exist until React commits — focus after paint.
  requestAnimationFrame(() => focusField(`users.${index}.email`));
};
```

A container path works too — `focusField("address")` lands on the first rendered `address.*` control — and a path that matches no named control falls back to the element whose `id` is exactly the path (how name-less composite widgets like Ant Design's `Select` with `id={path}` stay reachable; exact id match only). The root `""` path means whole-form scope: `focusField("", formEl)` focuses the form's first focusable control. Pass your `<form>` element as `root` on multi-form pages, exactly like `focusFirstError` (with the default `document` scope and several forms, `focusField("")` refuses to guess and returns `false`).

## Rebase after save

After a successful save, the just-saved values become the new baseline — `adoptValues` swaps `values` and `initialValues` without wiping interaction state, so the form reads clean but `touched`/`submitCount` survive.

```tsx
await api.save(form.getState().values);
form.adoptValues(form.getState().values);
// useIsDirty() is now false; touched and submitCount are preserved.
```

Use [`reset()`](./state#reset-vs-adoptvalues) instead when you want a full wipe.
