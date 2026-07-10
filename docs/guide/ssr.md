# SSR and Next.js

formstand is client state — a zustand store driving controlled inputs. Server rendering interacts with that in exactly three places: where the form object is **created**, what its **initial values** are, and when **persistence** runs. Get those right and the rest is ordinary React.

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

`useForm` creates the store **per component instance** — every request's render gets its own, and nothing is shared across users. Server components can't call hooks at all, so the boundary is enforced by Next itself: put the form in a client component, pass server data down as props.

## Why `createFormHooks` needs care on the server

`createFormHooks(form, name)` is built on a **module-scope singleton** — that's its whole point in an SPA: one form, importable hooks, no provider. On a server, module scope is shared **across requests in the same process**:

```ts
// hooks.ts — module scope: ONE store per server process, not per request
export const profileForm = createForm(profileSchema, { initialValues });
export const { useProfileField } = createFormHooks(profileForm, "profile");
```

During SSR, every concurrent request rendering this form reads (and could write) the *same* store. For a form that only ever renders its initial values on the server — the normal case, since users type on the client — the practical exposure is small: the server render reads pristine initial state, and hydration hands over to a client-side store that behaves like the SPA case. But two things must stay true:

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

No server render, no shared-module concern — at the cost of the form not being in the initial HTML.

## Hydration checklist

- **Deterministic initial values.** `new Date()`, `Math.random()`, or locale-formatted strings in `initialValues` render differently on server and client — a hydration mismatch. Compute per-request values on the server and pass them in, or set them in an effect after mount.
- **Persistence runs in effects.** `localStorage` doesn't exist on the server. Call [`persistForm`](./state#persistence) (or any storage access) inside `useEffect`, never during render:

  ```tsx
  useEffect(() => {
    const handle = persistForm(form, { key: "profile-draft" });
    return handle.dispose;
  }, [form]);
  ```

- **`focusField` / `focusFirstError` are DOM calls.** Safe to import anywhere (they touch the DOM only when called), but call them from event handlers or effects.
- **The generated modules are client modules.** `formstand-gen --layout module` output uses `createFormHooks` — add `"use client"` at the top of the module's files when dropping one into an App Router project, and treat it per the singleton rules above.
