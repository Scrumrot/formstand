# Errors: schema & server

This page covers formstand's two-channel error model: the validation-owned schema channel, the app-owned server channel, the derived `errors` map your UI reads, the exact rules for when a server error is released, root-level errors, focusing the first errored input, and how submit behaves while server errors are present.

## The two channels

Error state is stored in two separate channels, with distinct owners:

- **`state.schemaErrors` — owned by validation.** Every validation pass rebuilds it: full passes replace it wholesale, field-scoped passes splice only their scope. Your app never writes it.
- **`state.serverErrors` — owned by you.** `setError` / `setErrors` write it and `clearErrors` clears it. Validation never reads or writes this channel.

That ownership split *is* the preservation guarantee. A background `validateAsync()` finishing after your submit handler set a "username taken" message physically cannot wipe it — it can't touch the channel the message lives in. There are no "manual error" marks or bookkeeping flags to get wrong.

```ts
form.handleSubmit(async (data) => {
  const res = await api.create(data);
  if (!res.ok) {
    for (const err of res.errors) {
      // setError's path is typed; a server-provided string needs a cast
      form.setError(err.field as FieldPath<z.input<typeof schema>>, err.message);
    }
  }
});
```

## The derived `errors` map

`state.errors` — the map `useField`, `useIsValid`, and the bound components read — is **derived** from the two channels on every write, under one merge rule:

- The **schema's message wins at a key**: it re-judged the same value the server did, and it judged it more recently by definition (validation reruns; the server verdict is a snapshot).
- **Server entries show where the schema is silent.**

The merge is order-independent. Calling `setError` on a key the schema currently rejects stores the verdict (visible in `state.serverErrors`) *behind* the schema message. If the schema later clears at that key **without the value changing** — say a cross-field refine stopped firing — the stored server verdict resurfaces, because the value it judged is unchanged. You don't have to sequence your writes around validation.

Keys are dot paths (`"users.0.email"`), values are `readonly string[]`. Root-level messages live at the `""` key (see below).

## Writing the server channel

```ts
form.setError("username", "taken");             // single string...
form.setError("username", ["taken", "reserved"]); // ...or an array
form.setError("username", []);                  // empty array removes the entry

form.setErrors({ username: ["taken"], "": ["account limit reached"] });
// replaces the WHOLE server channel (schema errors persist until the next pass)

form.clearErrors("address");  // clears BOTH channels at "address" and its descendants
form.clearErrors("");         // clears just the root "" entry
form.clearErrors();           // clears everything, both channels
```

Note the asymmetry: `setError`/`setErrors` touch only the server channel, but `clearErrors` scrubs both — schema errors it removes simply return on the next validation pass.

From a field, `useField` exposes the same surface scoped to its path: `field.setError([...])` and `field.clearError()`.

## When a server error is released

A server verdict describes a specific value. It's automatically released when:

1. **The value on its spine changes.** `setValue` / `resetField` / an array op at the path, a *descendant*, or an *ancestor* releases it — editing `address.street` releases a verdict on `address` (the container it judged changed), and replacing `address` wholesale releases a verdict on `address.street`. Array ops release verdicts on the array itself, while row-level entries follow their rows through re-indexing (a verdict on `items.1.name` moves to `items.0.name` when row 0 is removed — that row's value didn't change).
2. **A `setValues` bulk write changes its value slice.** Only entries whose slice actually changed are released; a verdict on an untouched field survives a `setValues` that rewrites its siblings.
3. **A field-scoped validation targets its path.** `validateField` / `validateFieldAsync` / `validateFields` on the path supersede the server verdict — you explicitly asked for a fresh judgment there. (`validateField("")` counts as a full pass and, like `validate()`, leaves the server channel alone.)
4. **You clear or rebase:** `clearErrors`, `reset`, or `adoptValues`.

Nothing else releases it — in particular, full-form validation passes never do.

## Root errors: the `""` key

A schema-level `.refine` (or a form-level server failure you record with `setError("", ...)`) has no field path; its messages live at the `""` key:

```ts
const schema = z
  .object({ password: z.string(), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "passwords must match" });
```

Read it with the shortcut hook:

```tsx
import { useFormError } from "formstand";

const FormError = ({ form }: { form: FormStateApi }) => {
  const error = useFormError(form); // state.errors[""]
  return error ? <p role="alert">{error[0]}</p> : null;
};
```

Because any value write makes a form-level verdict stale, the root `""` server entry is released by **every** value write.

## Focusing the first error

`focusFirstError(errors, root?)` focuses the first control in DOM order whose `name` attribute matches an errored path — exactly, or as a descendant of an errored container path, so an array-level error like `z.array().min(1)` lands on the array's first rendered input. The bound components set `name={path}`, so this works out of the box:

```tsx
<form onSubmit={form.handleSubmit(onValid, (errors) => focusFirstError(errors))}>
```

Matching is most-specific-first: the root `""` key falls back to focusing the first control only when no field-keyed error matches anything — a form-wide refine must not steal focus from an actually errored field. Hidden and disabled controls are skipped (a leading `<input type="hidden" name="csrf">` won't swallow the fallback). Pass `root` to scope the search to a specific element; the function returns whether anything was focused, and is safe to import during SSR.

## Submit proceeds despite server errors

`submit` re-validates against the **schema** only. If the schema passes, your `onValid` handler runs even while server errors are present — the server gets to re-judge the submission. The stale verdicts simply remain in the merged map (so `useIsValid` stays `false`) until the user edits the field, a field-scoped validation targets it, or your handler clears/overwrites them.

Also note the other direction: a failed submit writes schema errors *and marks each errored field touched*, so touched-gated error UIs show something after the first failed submit.

## Patching state: `errors` is derived

`updateState(updater)` applies an atomic multi-field patch — but since `errors` is derived, the patch type **omits it entirely**. Patch the channels instead, and the merged map is re-derived for you:

```ts
form.updateState((state) => ({
  serverErrors: { ...state.serverErrors, username: ["taken"] },
  touched: { ...state.touched, username: true },
}));
```

A plain-JavaScript caller that sneaks an `errors` patch through gets a console warning and the patch is ignored. The same invariant holds at the `restore(snapshot)` boundary: the merged map is re-derived from the snapshot's channels, never trusted as stored.

## Next

- [Validation](./validation) — the passes that write the schema channel.
- [Form state & lifecycle](./state) — `updateState`, `snapshot`/`restore`, `reset` vs `adoptValues`.
