# formstand with Next.js server actions

A Next.js app router page with one formstand form that submits through a server action, and the server action re-validating the payload with the same zod schema.

```bash
cd examples/next
npm install
npm run dev
```

The three files that matter:

- `app/schema.ts`: the zod schema, the initial values, and the action's serializable state. One schema, parsed twice.
- `app/SignupForm.tsx` (`"use client"`): `useForm` plus `useFormActionState`, bound to `<form action={...}>` with the bound components. The browser validates before the action runs; an invalid submit writes field errors and never calls the server.
- `app/actions.ts` (`"use server"`): `saveSignup(prev, data)` parses `data` with the schema again before doing anything, because a server action is a network endpoint any client can call. A `@example.com` address is rejected to show the failure path end to end.

`app/page.tsx` is a server component that renders the form; `app/layout.tsx` is the root layout. There is nothing in `next.config.ts`.

CI installs this app against the published `formstand` and runs `next build` on every push, and the repo's test suite renders `SignupForm` against the library source (`tests/examples.next.test.tsx`), so the example cannot drift from either the framework or the library. The [SSR and Next.js guide](https://scrumrot.github.io/formstand/documentation/ssr) explains the rules this app follows.
