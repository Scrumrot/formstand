# Hooks

Every React hook formstand exports. For the imperative surface these wrap, see [`createForm` and `Form`](./).

## React hooks

| Hook | Signature | Notes |
| --- | --- | --- |
| `useForm` | `useForm(schema, options): Form<TSchema>` | lazy-creates a form held for the component's lifetime; schema and option changes after mount are ignored (warned once) |
| `useField` | `useField(form, path, options?): UseFieldReturn<V>` | one field's slice plus helpers. `path` may be a selector `(state) => string`, which returns `UseFieldReturn<unknown>`; `options: { debounceMs?: number }` debounces triggered validation. An explicit type argument on a schema-typed form is a readable compile error, because the value type infers from the path (see [Typed paths](../typed-paths#paths-are-inferred-from-the-schema)) |
| `useFieldArray` | `useFieldArray(form, path): UseFieldArrayReturn<TItem>`, with `TItem` inferred from the schema through the path (explicit `<TItem>` only for schema-less `FieldFormApi` forms) | array ops plus stable ids; see [Field arrays](../field-arrays). An explicit `<TItem>` on a schema-typed form is a readable compile error (see [Typed paths](../typed-paths#paths-are-inferred-from-the-schema)) |
| `useVariantField` | `useVariantField(form, unionPath, field): UseFieldReturn<V \| undefined>` | binds a variant-only field of a discriminated union, since `FieldPath` exposes only common keys. See [Discriminated unions](../components#discriminated-unions). An explicit type argument on a schema-typed form is a readable compile error, because the variant value infers from the union path and field (see [Typed paths](../typed-paths#paths-are-inferred-from-the-schema)) |
| `useFormSelector` | `useFormSelector(form, selector): U` | selector-style subscription over `FormState` |
| `useFormSelectorShallow` | `useFormSelectorShallow(form, selector): U` | shallow-compared variant, required for object or array returning selectors |
| `useFormValues` | `useFormValues(form): z.input<TSchema>` | the whole values object, reactively. Sugar for `useFormSelector(form, (s) => s.values)`. Reference-compared (values are replaced immutably), so it re-renders exactly when some value changes and never on touched or error churn. Reach for it when rendering is driven by values, such as a live map or preview. Structural `FormStateApi` forms read `unknown` |
| `useFormError` | `useFormError(form): readonly string[] \| undefined` | shortcut for the root `""` error |
| `useIsDirty` | `useIsDirty(form, path?): boolean` | any field dirty (derived); a typed path scopes it to that subtree, so `"shipping"` covers `shipping.city` |
| `useIsValid` | `useIsValid(form, path?): boolean` | no errors currently in the merged map, which is not the same as a fresh validation; a typed path scopes it to errors at or under that path |
| `useIsSubmitting` | `useIsSubmitting(form): boolean` | `state.isSubmitting` |
| `useSubmitCount` | `useSubmitCount(form): number` | `state.submitCount` |
| `createFormContext` | `createFormContext<TSchema>(): { Provider, useFormContext }` | typed context factory for prop-drilling-free forms |
| `createFormHooks` | `createFormHooks(form, name?): FormHooks` | every hook pre-wired to one form, with the name baked into the hook names (`"invoice"` gives you `useInvoiceField` and friends). This is the provider-free way to share a module-singleton form; see [State](../state#pre-wired-hooks-createformhooks) |

The pre-0.2 names `useFormState` and `useFormStateShallow` were renamed to `useFormSelector` and `useFormSelectorShallow`, because React DOM ships its own deprecated `useFormState` and auto-imports kept grabbing the wrong one. The deprecated aliases were removed in 0.4.0.

## `UseFieldReturn<TValue>`

| Field | Type | Notes |
| --- | --- | --- |
| `path` | `string` | the resolved path, used as the input's `name` |
| `value` | `TValue` | typed via `FieldValue` when the form carries a schema |
| `initialValue` | `TValue` | the `initialValues` slice `dirty` compares against |
| `emptyValue` | `null \| undefined` | what a cleared input writes back, introspected from the zod schema (`.nullable()` gives `null`, `.optional()` gives `undefined`), with an initial-value fallback for schema-less forms |
| `error` | `readonly string[] \| undefined` | from the merged error map |
| `touched` / `dirty` / `isValidating` | `boolean` | |
| `setValue(v)` | | writes the value and triggers mode-appropriate validation |
| `setTouched(touched?)` | | |
| `setError(errors)` | | writes the server channel at this path; takes a single `string` or a `readonly string[]`, like `form.setError` |
| `clearError()` | | `clearErrors(path)`, covering both channels at this path and its descendants |
| `validate()` / `validateAsync()` | | field-scoped validation |
| `onBlur()` | | marks touched and triggers mode-appropriate validation |

## `UseFieldArrayReturn<TItem>`

| Field | Type |
| --- | --- |
| `fields` | `readonly { id: string; value: TItem }[]`, where `id` is your React key |
| `items` | `readonly TItem[]` |
| `length` | `number` |
| `error` | `readonly string[] \| undefined`, the array-level error |
| `push(item)` / `remove(index)` / `insert(index, item)` / `move(from, to)` / `swap(a, b)` | wrappers over the form's array ops |
