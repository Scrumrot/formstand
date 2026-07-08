# Typed paths

This page covers how formstand infers field paths and value types from your zod schema: what `FieldPath` accepts, how writes are checked, dynamic and selector-based paths, and the two things that can degrade inference — `z.coerce` and keys containing dots.

## Paths are inferred from the schema

Every path-taking API is typed against `z.input<TSchema>`. Paths are dot-separated strings, with numeric segments for array indices:

```ts
import { z } from "zod";
import { createForm } from "formstand";

const schema = z.object({
  name: z.string(),
  users: z.array(z.object({ email: z.string(), age: z.number() })),
});

const form = createForm(schema, {
  initialValues: { name: "", users: [{ email: "", age: 0 }] },
});

form.getField("users.0.email"); // string
form.getField("users.0");       // { email: string; age: number }
form.getField("users");         // the whole array
```

Reads **and writes** are typed. A typo'd path or a wrong value type is a compile error, not a runtime surprise:

```ts
form.setValue("users.0.age", 42);       // ok
form.setValue("users.0.age", "42");     // compile error: not a number
form.setValue("naem", "x");             // compile error: no such path
form.setTouched("users.0.emial");       // compile error
form.validateField("users.0.email");    // paths checked here too
form.arrayPush("users", { email: "", age: 0 }); // item type checked
```

Optional and nullable object levels stay addressable: for `profile: z.object({...}).optional()`, the path `"profile.name"` typechecks, and its `FieldValue` is widened with `| undefined` because the parent may be absent at runtime.

## Dynamic paths

Template-literal paths with a numeric index typecheck as-is — `FieldPath` includes the `` `users.${number}.email` `` pattern:

```tsx
const Row = ({ form, i }: { form: Form<typeof schema>; i: number }) => {
  const email = useField(form, `users.${i}.email`); // typed: string
  return <input {...textInputProps(email)} />;
};
```

A **fully runtime-built string** (e.g. assembled from user input or a server response) is just `string`, which `FieldPath` can't verify. Cast at the boundary:

```ts
import type { FieldPath } from "formstand";

form.setValue(
  path as FieldPath<z.input<typeof schema>>,
  value as never,
);
```

The cast is deliberate friction: it marks the one place where you, not the compiler, vouch for the path.

## Path as a selector

`useField` also accepts a function from state to path, for fields whose location depends on other form state:

```ts
const email = useField(form, (state) => `users.${state.values.selectedIdx}.email`);
```

The hook re-resolves the path on every state change, so it tracks the selection automatically. Because the path is computed at runtime, this overload returns `UseFieldReturn<unknown>` — narrow the value yourself if you need it typed. `useFieldArray` accepts the same selector form for its path.

## The `z.coerce` pitfall

Form values are typed as `z.input<Schema>`, and in zod v4 the *input* of `z.coerce.number()` is `unknown`. `FieldPath` and `FieldValue` can't see through `unknown`, so path inference collapses for those fields — and, since `unknown` widens the whole object, often for their siblings too.

Keep the field's input type honest instead:

```ts
// Avoid: input type is unknown, path inference degrades
const schema = z.object({ age: z.coerce.number() });

// Prefer: honest input type, parse in a pipe/transform...
const schema = z.object({
  age: z.string().pipe(z.transform(Number)).pipe(z.number()),
});

// ...or just model it as a number and let NumberField parse the text for you
const schema = z.object({ age: z.number() });
```

`NumberField` (and `numberInputProps`) already convert typed text to `number` before writing, so the schema rarely needs to coerce anything — see [Bound components](./components).

## How path segments are interpreted

At runtime, the **existing container** decides what a segment means: arrays take numeric segments as indices, plain objects take any segment as a string key — so a `z.record` keyed `"0"` reads and writes the record key instead of silently becoming an array. Only when the container doesn't exist yet does the segment type pick what's created (numeric creates an array, anything else an object).

Three limitations:

- **Keys containing `.` are not addressable.** Paths are split on dots, so a record key like `"a.b"` can't be reached. Use nested objects or dot-free keys.
- **Array writes beyond index 100 000 are refused** (with a console warning) — a typo'd index must not allocate gigabytes.
- **`FieldPath` stops at 7 segments deep.** The union is built by recursing through your schema's shape, and each level multiplies the work TypeScript does per path-taking call — uncapped, a deep or self-referential type would make every keystroke in your editor pay for it. So paths like `a.b.c.d.e.f.g.h` fall out of the union: the *runtime* handles them fine (every path API walks arbitrary depth), the compiler just can't vouch for them anymore. Cast at the boundary exactly like a [runtime-built string](#dynamic-paths) — or, better, ask whether a form nine levels deep wants a flatter schema.

## Next

- [Validation](./validation) — what happens when those typed values are parsed.
- [Field arrays](./field-arrays) — working with the numeric segments ergonomically.
