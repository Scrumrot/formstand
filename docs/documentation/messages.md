# Messages and localization

Where an error's text comes from, how to change it for one field or a whole app, how a translated app keys its messages, and what the generator emits by default. The mechanics of *where errors land* are on [Errors: schema & server](./errors); this page is about the words.

## Who owns the text

formstand stores a message as a plain string. `ErrorMap` is `Readonly<Record<string, readonly string[]>>`: a path, and the messages at it in the order validation produced them. The library never writes a message of its own into that map. Every string in the schema channel comes from zod (the schema's own text, or zod's default for the check), and every string in the server channel comes from your code (`setError`, `addErrors`, `setErrors`). `field.firstError` and `useFormError` read them back unchanged.

That is the decision, and it is deliberate: messages stay strings, and the schema stays the single place validation text lives. A richer error object (a code plus parameters) would move the translation problem into the library and give every consumer a second thing to map; the pattern below gets the same result with the string the schema already carries.

## Messages belong in the schema

The schema is the source of truth for validation, so its text is the source of truth for the message. zod 4 takes the message as the check's `error` parameter (a string, or a function of the issue), and `.refine` and `.superRefine` take it the same way:

```ts
const schema = z.object({
  name: z.string().min(2, { error: "at least 2 characters" }),
  email: z.email({ error: "a valid email address" }),
  age: z.int().min(18, { error: (issue) => `must be at least ${String(issue.minimum)}` }),
  password: z.string().min(8, { error: "at least 8 characters" }),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, {
  path: ["confirm"],
  error: "passwords do not match",
});
```

The shorthand `min(2, "at least 2 characters")` still works. Either way, the text reaches `field.error` through `flattenIssues`, which keeps the most specific message for a union (a branch's own text wins over the union's generic one) and preserves the order zod reported.

A schema with no messages is the one case where the UI shows text you did not write: zod's defaults (`"Too small: expected string to have >=2 characters"`). They are accurate and they are not for users. Give every check a message, or set a locale as described next.

## Changing text for a whole app

zod's error map is the global hook. Two uses matter here.

**A locale.** zod ships 63 locales; one line switches every default message:

```ts
import { z } from "zod";
z.config(z.locales.de());
```

**A custom map.** `z.config({ customError })` runs for every issue and may return a string or `undefined` to fall through. It is the place for an app-wide tone, or for translating zod's issue codes yourself:

```ts
z.config({
  customError: (issue) =>
    issue.code === "too_small" && issue.origin === "string"
      ? `needs at least ${String(issue.minimum)} characters`
      : undefined,
});
```

Both calls are process-wide and belong where the app boots (an entry module, or a server's startup), before any form is created. Per-check `error` text wins over both, so a schema can still carry one deliberately worded message.

## Translating with stable keys

An app with a translation layer wants a key in the schema and the text at render, so the schema stays locale-free and the dictionary owns the words. The string in the schema *is* the key:

```ts
const schema = z.object({
  name: z.string().min(2, { error: "errors.name.tooShort" }),
  email: z.email({ error: "errors.email.invalid" }),
});
```

```tsx
const name = useField(form, "name");
<span {...a11y.message}>{name.firstError ? t(name.firstError) : " "}</span>
```

Three things keep this honest:

- **Parameters ride in the key or in the dictionary.** A message with a number in it (`min(2)`) either encodes it in the key (`"errors.name.min2"`) or the dictionary holds the number; the `error: (issue) => ...` form can build a key that carries the parameter (`` `errors.tooSmall.${String(issue.minimum)}` ``) when the dictionary is generated.
- **Server messages are already translated or are keys too.** `setError("email", "errors.email.taken")` goes through the same `t()` at render; a server that returns final text in the user's language bypasses it. Pick one convention per app; the library treats both as strings.
- **The bound components render the raw string.** `TextField` and friends print `field.firstError` as is, so an app on keys either wraps them (a `TranslatedTextField` that maps the error before rendering) or binds raw inputs with `textInputProps` and renders the translated line itself, the way the hand-rolled playground demos do.

## What the generator emits

`formstand-gen` writes the schema in type mode and JSON Schema mode, and the checks it emits carry **no messages**: `z.string().min(2)`, `z.email()`, `z.int().gte(18)`. The IR carries the bounds, not authored text, so the generated schema shows zod's defaults until you edit it, which the file's header invites. In zod mode the schema is yours and its messages ship as written. The playground's generated kitchen-sink demo had its messages added by hand for exactly this reason.

## Accessibility of the text

A message only helps when it is announced. The bound components attach it with `aria-describedby`, set `aria-invalid` while it shows, and give the line `aria-live`; a hand-rolled input gets the same wiring from the `fieldA11y` pattern the playground demos share. A translated message is announced like any other, since it is the rendered text that is read.
