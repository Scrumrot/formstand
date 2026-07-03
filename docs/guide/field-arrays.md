# Field arrays

This page covers `useFieldArray`: rendering array fields with stable React keys, the operations it exposes, how id reconciliation keeps keys glued to rows, nested arrays, array-level errors, and how per-row metadata (errors, touched state, server verdicts) follows rows through reorders.

## `useFieldArray(form, path)`

```tsx
import { useFieldArray, useForm } from "formstand";
import { z } from "zod";

const schema = z.object({
  users: z.array(z.object({ email: z.string(), name: z.string() })).min(1, "add at least one user"),
});

type User = z.input<typeof schema>["users"][number];

const UsersEditor = ({ form }: { form: Form<typeof schema> }) => {
  const users = useFieldArray<User>(form, "users");

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

The path can also be a selector function, like `useField`'s — see [Typed paths](./typed-paths#path-as-a-selector).

## Stable ids

React keys must follow *items*, not indices — otherwise removing row 0 makes every row re-mount with its neighbor's state. `useFieldArray` derives a stable `id` per item by reconciling the live array against the previous render's array:

- **Ids follow item identity.** A reorder, insert, or remove keeps each row's id glued to its item — including mutations made *outside* the hook (`form.arrayMove`, `setValue`, `restore`, or a second `useFieldArray` on the same path).
- **Edited rows keep their id.** Editing a field produces a fresh item object (state is immutable), so identity matching alone would mint a new id and remount the row. A positional fallback hands a vanished item's id to a still-unmatched item, so in-place edits update the row instead of remounting it.
- **Genuinely new items get fresh ids.** Ids never repeat within the hook's lifetime.
- Ids **reset when the hook's `path` changes** — an inner field array inside a reordered outer item gets fresh ids.

::: warning Primitive arrays with duplicate values are best-effort
For an array of primitives (e.g. tags as plain strings), duplicate values are indistinguishable — `["a", "a"]` reordered is identical to itself. Duplicates are matched in order, which is correct for appends and removes, but a reorder among *equal* values can't be tracked. If rows carry focus or animation state, prefer objects (`{ id, label }`) over bare primitives.
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
  const tracks = useFieldArray<Track>(form, `albums.${index}.tracks`);

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

Array ops don't just move values — every path-keyed map is re-keyed through the same index mapping, so `errors`, `touched`, `isValidating`, and server verdicts stay attached to their rows:

- After `remove(0)`, an error on `items.1.name` becomes an error on `items.0.name` — same row, new index.
- A [server error](./errors) on a row survives a reorder (that row's value didn't change); a server verdict on the *array itself* or an ancestor is released — the op changed that value.
- Dirtiness is derived, not stored, so `push` followed by `remove` reads clean again.

Out-of-range or non-integer indices are refused with a console warning rather than corrupting the re-keyed maps, and an op on a path whose value isn't an array is skipped with a warning.

## Next

- [Errors: schema & server](./errors) — the release contract server errors follow through array ops.
- [Form state & lifecycle](./state) — derived dirtiness and `diff()` over arrays.
