# SSR and Next.js

formstand is client state, a zustand store driving controlled inputs. Server rendering touches that in exactly three places: where the form object is **created**, what its **initial values** are, and when **persistence** runs. Get those right and the rest is ordinary React.

## The rule of thumb

Use `useForm` inside a `"use client"` component. That's it for most apps:

```tsx
"use client";

import { useForm, TextField } from "formstand";
import { profileSchema } from "./profileSchema";

export function ProfileForm() {
  const form = useForm(profileSchema, { initialValues: { name: "" } });
  return <TextField form={form} path="name" label="Name" />;
}
```

`useForm` creates the store **per component instance**, so every request's render gets its own and nothing is shared across users. Server components can't call hooks at all, so the boundary is enforced by Next itself: put the form in a client component and pass server data down as props.

## Why `createFormHooks` needs care on the server

`createFormHooks(form, name)` is built on a **module-scope singleton**, which is its whole point in an SPA: one form, importable hooks, no provider. On a server, module scope is shared **across requests in the same process**:

```ts
// hooks.ts: module scope means ONE store per server process, not per request
export const profileForm = createForm(profileSchema, { initialValues });
export const { useProfileField } = createFormHooks(profileForm, "profile");
```

During SSR, every concurrent request rendering this form reads (and could write) the *same* store. For a form that only ever renders its initial values on the server, which is the normal case since users type on the client, the practical exposure is small: the server render reads pristine initial state, and hydration hands over to a client-side store that behaves like the SPA case. But two things must stay true:

1. **Never write to the form during render or in server code.** A `setValue` on the server mutates state visible to other requests.
2. **Initial values must be static.** Anything per-request (the logged-in user's data) must NOT be baked into the module singleton.

When either of those doesn't hold, don't use the singleton on the server. The alternatives:

### Per-request data: `useForm` + `createFormContext`

The provider pattern gives you the module's ergonomics with per-mount lifetime:

```tsx
"use client";

const { FormProvider, useFormContext } = createFormContext<typeof profileSchema>();

export function ProfileFormRoot({ initial }: { initial: ProfileValues }) {
  const form = useForm(profileSchema, { initialValues: initial });
  return <FormProvider form={form}>{/* fields use useFormContext() */}</FormProvider>;
}
```

Server component fetches → passes `initial` as a prop → each request/mount gets its own store, and the subtree still avoids prop-drilling.

### Client-only singletons: `next/dynamic` with `ssr: false`

If you want `createFormHooks` exactly as-is, render its consumer client-only:

```tsx
const OnboardingForm = dynamic(() => import("./OnboardingForm"), { ssr: false });
```

No server render and no shared-module concern, at the cost of the form not being in the initial HTML.

## React 19 form actions

`useFormAction` and `useFormActionState` bind a form to the actions world — `<form action={...}>`, `useActionState`, server actions — with the same contract `handleSubmit` gives the onSubmit world: the schema validates **before** the action runs, `isSubmitting`/`submitCount` track it, a failed submission writes errors and marks its fields touched, and a throwing action goes through `onError` (dev builds warn when nothing observes a failure).

The handler receives parsed, typed data, not `FormData` — formstand inputs are controlled, so the store is the source of truth and the schema has already judged it. The raw `FormData` still arrives as the last argument for what only it carries: uncontrolled inputs sharing the `<form>`, file pickers.

```tsx
// Plain action:
const save = useFormAction(form, async (data) => {
  await api.save(data);         // data: z.output<typeof schema>
}, { onError: () => form.setError("", "Could not save — try again") });

<form action={save}>...</form>

// With result state — the handler shape mirrors useActionState's
// (prevState, payload), with parsed data spliced in, so a "use server"
// function slots straight in:
const [result, saveAction, isPending] = useFormActionState(
  form,
  saveProfile,                  // async (prev, data, formData) => NextState
  { status: "idle" } as SaveState,
);
```

A submission that fails validation returns the **previous** state unchanged: the field errors already live in the form store where the bound components read them, so the action state stays what it is — the last verdict an action actually produced.

Two honest notes. This is a *client-side* integration: React's no-JS progressive enhancement only works when the server action itself is passed to the form, which by definition skips any client wrapper — for that path, validate on the server with the same zod schema and treat the bridge as the hydrated experience. And React 19's post-action reset only clears **uncontrolled** fields; formstand inputs are controlled, so the form's values survive the action untouched.

## Hydration checklist

- **Deterministic initial values.** `new Date()`, `Math.random()`, or locale-formatted strings in `initialValues` render differently on server and client, which is a hydration mismatch. Compute per-request values on the server and pass them in, or set them in an effect after mount.
- **Persistence runs in effects.** `localStorage` doesn't exist on the server. Call [`persistForm`](./state#persistence) (or any storage access) inside `useEffect`, never during render:

  ```tsx
  useEffect(() => {
    const handle = persistForm(form, { key: "profile-draft" });
    return handle.dispose;
  }, [form]);
  ```

- **`focusField` / `focusFirstError` are DOM calls.** Safe to import anywhere (they touch the DOM only when called), but call them from event handlers or effects.
- **The generated modules are client modules.** `formstand-gen --layout module` output uses `createFormHooks`, so add `"use client"` at the top of the module's files when dropping one into an App Router project, and treat it per the singleton rules above.
