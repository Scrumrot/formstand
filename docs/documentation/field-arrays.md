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
  // The item type is inferred from the schema through the path, so push()
  // below knows a user is { email: string; name: string }.
  const users = useFieldArray(form, "users");

  return (
    <>
      {users.fields.map((field, i) => (
        <UserRow key={field.id} form={form} index={i} onRemove={() => users.remove(i)} />
      ))}
      {users.firstError ? <p role="alert">{users.firstError}</p> : null}
      <button type="button" onClick={() => users.push({ email: "", name: "" })}>
        Add user
      </button>
    </>
  );
};
```

The hook returns:

- `fields`: `readonly { id: string; value: TItem }[]`; use `field.id` as the React `key`.
- `items`: the raw array values (`readonly TItem[]`).
- `length`: the current length.
- `error`: the **array-level** error, for example from `z.array().min(1)`, keyed at the array's own path. `firstError` is the first message or `undefined`, same shorthand as `useField`.
- `path`: the resolved array path, and `setError(errors)` / `clearError()`: the array-level server channel, so a "too many rows" verdict from your API is set and cleared from the hook that owns the array (same semantics as `field.setError`).
- `touched`, `dirty`, `isValidating`: the array's own flags, read at its path the way `useField` reads a leaf's. `touched` is the array path's flag (a row's blur does not set it), `dirty` compares the whole array against its initial value, and `isValidating` is the array path's in-flight flag. `setTouched(touched?)` writes the flag; `onBlur()` marks the array touched and validates it under the blur gate, for a list whose control is the add row or the group as a whole; `validate()` runs array-scoped validation and returns the same `{ kind }` result as `field.validate()`.
- `push(item)`, `remove(index)`, `insert(index, item)`, `move(from, to)`, `swap(a, b)`: wrappers over the form's `arrayPush`, `arrayRemove`, `arrayInsert`, `arrayMove`, and `arraySwap` that also **revalidate the array path** when the form's validation mode calls for it, under the same gate as a field edit (`mode`, `reValidateMode`, submit state). That is why an array-level error like `min(1)` clears the moment a row is added rather than on the next submit. The imperative `form.arrayPush(...)` family stays validation-silent, exactly like `form.setValue`, because event-driven validation belongs to the hooks.
- `replace(items)`, `update(index, item)`, `prepend(item)`, `clear()`: the whole-array writes, revalidating under the same gate. `replace` and `clear` write through `form.setValue`, so ids come from reconciliation: a row object that survives the replacement (the same reference, reordered) keeps its id, and a fresh row at the same index keeps that index's id; `update` writes one row in place and the row keeps its id; `prepend` is `insert(0, item)`.

With a `Form<TSchema>` the path must be an **array path**: one whose value is a variable-length `z.array` (optional and nullable arrays included). A scalar path or a `z.tuple` path is a compile error at the call, the same rule every `form.array*` op applies, since a tuple has a fixed arity no push or remove can honor. The accepted paths are spelled `ArrayPathsOf<F>` (or `ArrayFieldPath<Values>` at the values level), exported for components that take a form and an array path. With a typed path, including template paths like `` `albums.${index}.tracks` ``, `TItem` is **inferred from the schema** and needs no type argument. The explicit `useFieldArray<TItem>(form, path)` form is for schema-less `FieldFormApi` forms, where there is nothing to infer from. Passing it alongside a typed form is a compile error that tells you the fix: the path argument is blamed with `"Remove the explicit type argument: a schema-typed form infers the item type from the path"` (see [Typed paths](./typed-paths#paths-are-inferred-from-the-schema)). Dynamic paths via a selector function return `UseFieldArrayReturn<unknown>`, like `useField`.

The path can also be a selector function, like `useField`'s. See [Typed paths](./typed-paths#path-as-a-selector).

## Stable ids

React keys must follow *items*, not indices, or removing row 0 makes every row re-mount with its neighbor's state. `useFieldArray` derives a stable `id` per item, and the id state is **shared per `(form, path)`**, so every hook instance on the same array sees the same ids:

- **Array ops replay exactly.** `push`, `remove`, `insert`, `move`, and `swap`, whether called on the hook or imperatively as `form.arrayMove`, record their precise index mapping in the form, and id derivation replays it. Even rows with *equal values* keep the right ids through ops.
- **Everything else reconciles by identity/value.** Whole-array writes (`setValue`, `restore`, resets) carry no mapping, so ids follow item identity, with a positional fallback so an in-place edit (a fresh item object at the same position) updates its row instead of remounting it.
- **Genuinely new items get fresh ids.** Ids never repeat for a given form and path.
- A hook whose dynamic `path` changes reads the target path's shared id state, so two hooks pointed at the same array always agree.

::: warning Duplicate values in whole-array writes are best-effort
Array *ops* track duplicates exactly (see above). A whole-array write is the remaining ambiguity: after `setValue("tags", reordered)` the intent for `Object.is`-equal rows is unknowable, since `["a", "a"]` reordered is identical to itself, so duplicates match in order. If rows carry focus or animation state and you rewrite whole arrays, prefer objects (`{ id, label }`) over bare primitives. Exact op tracking is a `createForm` and `useForm` feature; a hand-rolled `FieldArrayFormApi` implementation reconciles by value only.
:::

### Render cost

The hook subscribes to the array **reference**. Values are replaced immutably, so a keystroke in any row produces a new array and re-renders the component that called `useFieldArray`, even though the ids and the other rows did not change. Keep that component to the list: render each row from its own component that takes `form` and `index` and reads its fields through `useField`, as `UserRow` and `AlbumRow` do above, so a keystroke re-renders the row being typed in plus the thin list shell. For large arrays wrap the row component in `React.memo` and give it stable props: `form` and `index` already are, and the ops (`users.remove`, `users.move`, and the rest) are memoized on `(form, path)`, so pass `onRemove={users.remove}` and call `onRemove(index)` inside the row rather than the inline `() => users.remove(i)` above, which is a new function every render and defeats the memo.

## Nested arrays

Field arrays nest without ceremony. Each level gets its own hook, and paths compose with template literals (adapted from the repo's `NestedArraysForm` example):

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
      {tracks.firstError ? <p role="alert">{tracks.firstError}</p> : null}
      <button type="button" onClick={() => tracks.push({ title: "", durationMin: 1 })}>
        + add track
      </button>
    </fieldset>
  );
};
```

Both directions work: `form.arrayPush("albums.0.tracks", track)` mutates the inner array, and reordering the outer `albums` array re-keys metadata for all nested paths. Inner ids are stored per *path* (`albums.0.tracks`), and the outer hook moves those stores with their rows: when it derives the new `albums` ids it notes which row went where and re-seats every descendant path's ids to match, so after a `move`, `swap`, `remove`, or a whole-array write the tracks of each album keep the ids they had. A slot vacated by `remove` drops its inner ids so a later row there starts fresh. The re-seat runs in the outer hook, so a tree that mounts only inner hooks and reorders the outer array imperatively still reconciles inner ids by value. Pass a `key` from the outer `fields` so each album's whole row subtree, inner hook included, moves with its album instead of being re-derived at a new index.

## Arrays inside a union variant

`FieldPath` on a discriminated union offers only the keys every variant shares, so an array that one variant declares sits at a path `useFieldArray` cannot take: with `top` as `asphalt | grass` and only asphalt carrying `lights`, `useFieldArray(form, "top.lights")` is a compile error. `useVariantFieldArray(form, unionPath, field)` is the array twin of [`useVariantField`](./components#discriminated-unions): it binds `${unionPath}.${field}` and types the rows from the variants that declare the array.

```tsx
const schema = z.object({
  top: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("asphalt"), lights: z.array(z.object({ color: z.string() })) }),
    z.object({ kind: z.literal("grass"), length: z.number() }),
  ]),
});

function Lights({ form }: { form: Form<typeof schema> }) {
  const kind = useField(form, "top.kind");                    // "asphalt" | "grass"
  const lights = useVariantFieldArray(form, "top", "lights"); // UseFieldArrayReturn<{ color: string }>
  return kind.value === "asphalt" ? (
    <>
      {lights.fields.map((row, index) => (
        <LightRow key={row.id} form={form} index={index} onRemove={() => lights.remove(index)} />
      ))}
      <button type="button" onClick={() => lights.push({ color: "" })}>Add light</button>
    </>
  ) : null;
}
```

The row's own fields are variant paths too, so they bind with `useVariantField` on a row template: `` useVariantField(form, "top", `lights.${index}.color`) ``. The return is exactly `useFieldArray`'s, stable ids included, and the runtime is the same hook on the joined path. The `field` argument is a variant sub-path like `useVariantField`'s: `"spec.lights"` reaches an array inside a variant-only object, and `` `lights.${index}.bulbs` `` an array nested in another variant array's rows. The union path may be row-indexed (`` `pavements.${index}` ``) when the union is itself a row item. A common-key array, one every variant declares, is a plain `FieldPath`, so it binds with `useFieldArray`, and the variant hook rejects it. Call the hook unconditionally and gate the rendering on the discriminant, as with `useVariantField`: its ops write the variant path whatever the active variant is. `createFormHooks` exposes a bound `use{Name}VariantFieldArray`, and `formstand-gen` emits this shape for arrays inside union variants.

## Array-level errors

Constraints on the array itself (`z.array(...).min(1)`, `.max(n)`, a `.refine` on the array) produce errors keyed at the array's path, exposed as `useFieldArray(...).error` and distinct from per-row errors like `albums.0.tracks.1.title`:

```tsx
{tracks.firstError ? <p role="alert">{tracks.firstError}</p> : null}
```

The hook's ops keep this error live under the **change** gate, the one `useField`'s `setValue` applies. An array op is a change, never a blur, so when the gate opens depends on the mode: in the default `onBlur` mode (and in `onSubmit`) ops stay silent until the first failed submit switches the form to `reValidateMode`, which is `onChange` by default; in `onTouched` they revalidate once the array path itself is touched (a blur inside a row marks that row's field, not the array, so use `form.setTouched("users")` or wait for the failed submit); in `onChange` and `all` they revalidate immediately. Once the gate is open, `push` past a `max(n)` raises the error and `push`-ing the missing row under a `min(1)` clears it, with no second submit needed. Custom `FieldArrayFormApi` implementations opt in by providing the optional `validateField(path)` member; without it, ops simply skip revalidation ([API notes](./api/utilities#the-structural-form-interfaces)).

## Metadata follows rows

Array ops don't just move values. `errors`, `touched`, and server verdicts are re-keyed through the same index mapping, so they stay attached to their rows:

- After `remove(0)`, an error on `items.1.name` becomes an error on `items.0.name`: same row, new index.
- A [server error](./errors) on a row survives a reorder, since that row's value didn't change. A server verdict on the *array itself* or an ancestor is released, because the op changed that value.
- Dirtiness is derived, not stored, so `push` followed by `remove` reads clean again.
- In-flight `isValidating` flags under the array are **dropped**, not re-keyed. The async pass that set one no longer matches the reshaped rows and its result will be discarded as stale, so re-keying the flag would show a spinner that no pass is going to clear.

Out-of-range or non-integer indices are refused with a console warning rather than corrupting the re-keyed maps, and an op on a path whose value isn't an array is skipped with a warning.

## Next

- [Errors: schema & server](./errors): the release contract server errors follow through array ops.
- [Form state & lifecycle](./state): derived dirtiness and `diff()` over arrays.
