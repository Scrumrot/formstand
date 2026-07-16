# Field arrays

This page covers `useFieldArray`: rendering array fields with stable React keys, the operations it exposes, how id reconciliation keeps keys glued to rows, nested arrays, array-level errors, and how per-row metadata (errors, touched state, server verdicts) follows rows through reorders.

## `useFieldArray(form, path)`

```tsx
import { useFieldArray, useForm } from "formstand";
import { z } from "zod";

const schema = z.object({
  users: z.array(z.object({ email: z.string(), name: z.string() })).min(1, "add at least one user"),
});

const UsersEditor = ({ form }: { form: Form<typeof schema> }) => {
  // The item type is inferred from the schema through the path — push()
  // below knows a user is { email: string; name: string }.
  const users = useFieldArray(form, "users");

  return (
    <>
      {users.fields.map((field, i) => (
        <UserRow key={field.id} form={form} index={i} onRemove={() => users.remove(i)} />
      ))}
      {users.error ? <p role="alert">{users.error[0]}</p> : null}
      <button type="button" onClick={() => users.push({ email: "", name: "" })}>
        Add user
      </button>
    </>
  );
};
```

The hook returns:

- `fields` — `readonly { id: string; value: TItem }[]`; use `field.id` as the React `key`.
- `items` — the raw array values (`readonly TItem[]`).
- `length` — the current length.
- `error` — the **array-level** error (e.g. from `z.array().min(1)`), keyed at the array's own path.
- `push(item)`, `remove(index)`, `insert(index, item)`, `move(from, to)`, `swap(a, b)` — thin wrappers over the form's `arrayPush` / `arrayRemove` / `arrayInsert` / `arrayMove` / `arraySwap`.

With a `Form<TSchema>` and a typed path (including template paths like `` `albums.${index}.tracks` ``), `TItem` is **inferred from the schema** — no type argument. The explicit `useFieldArray<TItem>(form, path)` form is for schema-less `FieldFormApi` forms (there is nothing to infer from); passing it alongside a typed form is a compile error. Dynamic paths via a selector function return `UseFieldArrayReturn<unknown>`, like `useField`.

The path can also be a selector function, like `useField`'s — see [Typed paths](./typed-paths#path-as-a-selector).

## Stable ids

React keys must follow *items*, not indices — otherwise removing row 0 makes every row re-mount with its neighbor's state. `useFieldArray` derives a stable `id` per item, and the id state is **shared per `(form, path)`** — every hook instance on the same array sees the same ids:

- **Array ops replay exactly.** `push`/`remove`/`insert`/`move`/`swap` — whether called on the hook or imperatively (`form.arrayMove`) — record their precise index mapping in the form, and id derivation replays it. Even rows with *equal values* keep the right ids through ops.
- **Everything else reconciles by identity/value.** Whole-array writes (`setValue`, `restore`, resets) carry no mapping, so ids follow item identity, with a positional fallback so an in-place edit (a fresh item object at the same position) updates its row instead of remounting it.
- **Genuinely new items get fresh ids.** Ids never repeat for a given form and path.
- A hook whose dynamic `path` changes reads the target path's shared id state — two hooks pointed at the same array always agree.

::: warning Duplicate values in whole-array writes are best-effort
Array *ops* track duplicates exactly (see above). A whole-array write is the remaining ambiguity: after `setValue("tags", reordered)` the intent for `Object.is`-equal rows is unknowable (`["a", "a"]` reordered is identical to itself), so duplicates match in order. If rows carry focus or animation state AND you rewrite whole arrays, prefer objects (`{ id, label }`) over bare primitives. Exact op tracking is a `createForm`/`useForm` feature — a hand-rolled `FieldArrayFormApi` implementation reconciles by value only.
:::

## Nested arrays

Field arrays nest without ceremony — each level gets its own hook, and paths compose with template literals (adapted from the repo's `NestedArraysForm` example):

```tsx
const schema = z.object({
  albums: z.array(
    z.object({
      title: z.string().min(1, "title required"),
      tracks: z.array(
        z.object({ title: z.string().min(1), durationMin: z.number().positive() }),
      ).min(1, "at least one track"),
    }),
  ).min(1, "at least one album"),
});

const AlbumRow = ({ form, index }: { form: Form<typeof schema>; index: number }) => {
  const title = useField(form, `albums.${index}.title`);
  const tracks = useFieldArray(form, `albums.${index}.tracks`);

  return (
    <fieldset>
      <input {...textInputProps(title)} placeholder="album title" />
      {tracks.fields.map((field, trackIndex) => (
        <TrackRow key={field.id} form={form} albumIndex={index} trackIndex={trackIndex} />
      ))}
      {tracks.error ? <p role="alert">{tracks.error[0]}</p> : null}
      <button type="button" onClick={() => tracks.push({ title: "", durationMin: 1 })}>
        + add track
      </button>
    </fieldset>
  );
};
```

Both directions work: `form.arrayPush("albums.0.tracks", track)` mutates the inner array, and reordering the outer `albums` array correctly re-keys metadata for all nested paths. Because the inner hook's path contains the outer index, its ids reset when the album moves — pass a `key` from the outer `fields` so the whole row subtree moves with its album.

## Array-level errors

Constraints on the array itself (`z.array(...).min(1)`, `.max(n)`, a `.refine` on the array) produce errors keyed at the array's path — exposed as `useFieldArray(...).error`, distinct from per-row errors like `albums.0.tracks.1.title`:

```tsx
{tracks.error ? <p role="alert">{tracks.error[0]}</p> : null}
```

## Metadata follows rows

Array ops don't just move values — `errors`, `touched`, and server verdicts are re-keyed through the same index mapping, so they stay attached to their rows:

- After `remove(0)`, an error on `items.1.name` becomes an error on `items.0.name` — same row, new index.
- A [server error](./errors) on a row survives a reorder (that row's value didn't change); a server verdict on the *array itself* or an ancestor is released — the op changed that value.
- Dirtiness is derived, not stored, so `push` followed by `remove` reads clean again.
- In-flight `isValidating` flags under the array are **dropped**, not re-keyed: the async pass that set one no longer matches the reshaped rows, and its result will be discarded as stale — re-keying the flag would show a spinner no pass is going to clear.

Out-of-range or non-integer indices are refused with a console warning rather than corrupting the re-keyed maps, and an op on a path whose value isn't an array is skipped with a warning.

## Next

- [Errors: schema & server](./errors) — the release contract server errors follow through array ops.
- [Form state & lifecycle](./state) — derived dirtiness and `diff()` over arrays.
