# Utilities and types

## Core utilities

Exported for building on top of the same primitives the library uses:

```ts
parsePath(path: string): readonly PathSegment[]   // "a.0.b" → ["a", 0, "b"]
getAtPath(obj: unknown, path: string): unknown    // read a dot path
setAtPath<T>(obj: T, path: string, value): T      // immutable write, containers created as needed

validateSync(schema, values): SettledValidationResult<Output>   // safeParse + flattenIssues
validateAsync(schema, values): Promise<SettledValidationResult<Output>>
flattenIssues(issues): ErrorMap                   // zod issues → path-keyed map (unions expanded per branch)
isAsyncRequiredError(e: unknown): boolean         // "schema needs async parsing" detector

shouldValidateOn(trigger, mode, reValidateMode, submitAttempted, touched?): boolean
```

`shouldValidateOn` is the mode-resolution rule the hooks use. `trigger` is `"change"` or `"blur"`, and `reValidateMode` replaces `mode` once `submitAttempted` is true.

```ts
persistForm(form, options): PersistHandle   // debounced draft save + load
// options: { key, storage?, debounceMs?, apply?, version? }
```

`persistForm` is the autosave recipe as a helper: it saves a debounced draft under `options.key` and restores it on the next load. Storage defaults to `localStorage` and is structural, so `sessionStorage` or any `{ getItem, setItem, removeItem }` works. See [Persistence](../state#persistence) for the `apply` modes and the SSR caveat, and [Drafts that outlive the schema](../state#drafts-that-outlive-the-schema) for `version`, which stamps each draft so one written under an older schema is discarded instead of applied.

## Exported types

Everything importable via `import type { ... } from "formstand"`:

- **Core:** `Form`, `CreateFormOptions`, `SubmitHandler`, `InvalidSubmitHandler`, `SubmitOptions`, `SubmitResult`, `ResetOptions`, `ReadonlyStoreApi`, `FieldSnapshot`
- **State:** `FormState`, `ErrorMap`, `BoolMap`
- **Paths:** `PathSegment`, `FieldPath`, `FieldValue`, `PathDepth` (the legal `pathDepth` budgets, the literals 0–25), `DefaultPathDepth` (the default budget, 9), `ArrayFieldPath<Values, D>` (the subset of `FieldPath` whose value is a variable-length array, what every `form.array*` op and `useFieldArray` accept) and `ArrayItemOf<V>` (the item type the array ops take at a value: the element type of a variable-length array, optional/nullable stripped, `never` for a tuple or a non-array)
- **Validation:** `ValidationResult`, `SettledValidationResult`, `FieldValidationResult`, `SettledFieldValidationResult`, `FieldsValidationResult`, `SettledFieldsValidationResult`, `ValidationMode`, `ValidationTrigger`
- **Hooks:** `FormStateApi`, `UseFieldReturn`, `FieldFormApi`, `FieldPathArg`, `UseFieldOptions`, `UseFieldArrayReturn`, `FieldArrayFormApi`, `FieldArrayEntry`, `UseFieldsReturn` (what [`useFields`](../components#composite-fields-usefields) returns), `FormProviderProps`, `FormContextApi`
- **Discriminated unions:** `VariantKeys`, `VariantFieldPath`, `VariantArrayFieldPath`, `VariantFieldValue`, `UnionValueAt`, the path and value types behind [`useVariantField`](../components#discriminated-unions) and [`useVariantFieldArray`](../field-arrays#arrays-inside-a-union-variant)
- **Masked inputs:** `MaskedInputBinding`, `MaskedInputOptions`, `MaskedParse` (what [`useMaskedInput`](../recipes#masked-and-formatted-inputs) takes and returns)
- **Multi-step:** `FormStep`, `StepStatus`, `UseFormStepsReturn` (the [`useFormSteps`](../multi-step) contract)
- **Form actions:** `FormActionHandler`, `FormActionStateHandler`, `FormActionOptions` (the [React 19 bridge](../ssr#react-19-form-actions))
- **Components:** `TextFieldProps`, `NumberFieldProps`, `DateFieldProps`, `CheckboxFieldProps`, `SelectFieldProps`, `SelectFieldOption`, `FieldRef`, `NumberInputBinding` (what [`useNumberInput`](./components#usenumberinput-field) returns), and the path filters behind the bound components' `path` props, for custom components with the same contract: `PathsOf<F>` (every typed path of a form prop), `PathsAccepting<F, V>` (the paths whose value is assignable to `V`), `ArrayPathsOf<F>` (the array paths, the form-level spelling of `ArrayFieldPath`), and `SelectValueAt<F, P>` (the option values a select at `P` may hold)
- **Prop builders:** `TextInputProps`, `NumberInputProps`, `DateInputProps`, `CheckboxProps`, `SelectProps`, `ParsedNumberText`, `ParsedDateText`
- **Persistence:** `PersistOptions`, `PersistStorage`, `PersistHandle` (see [`persistForm`](../state#persistence))
- **Pre-wired hooks:** `FormHooks` (the whole object [`createFormHooks`](../state#pre-wired-hooks-createformhooks) returns) and its member shapes `BoundUseField`, `BoundUseFieldArray`, `BoundUseFields`, `BoundUseVariantField`, `BoundUseSelector`, `BoundUseFlag`

From the `formstand/testing` subpath (see [Testing](../testing)):

- `fillField(form, path, value)`, `blurField(form, path)`, `fillAndBlurField(form, path, value)`, `fillFields(form, values)`, and `submitForm(form)`: store-level drivers that write through the same mode gates the hooks use, so a test never has to re-derive `mode`/`reValidateMode` semantics by hand.

From the `formstand/devtools` subpath (see [Devtools](../devtools)):

- `FormstandDevtools`, `FormstandDevtoolsProps<TSchema, D>` (the depth parameter defaults, so a `pathDepth`-widened form is accepted), `DevtoolsPosition`
- `leafPaths(values)` and `unmatchedErrorKeys(errorKeys, leaves)`, the path walk behind the panel's field table. Exported because the behaviour is worth reusing in a custom panel: empty containers count as leaves, array rows get a path each, and `unmatchedErrorKeys` is what surfaces the root `""` key and array-level messages that no field covers.

## The structural form interfaces

`FieldFormApi`, `FieldArrayFormApi`, and `FormStateApi` are the schema-less form interfaces the hooks accept, which is what lets you write a reusable field component that takes any form. When a real `Form<TSchema>` is passed, the typed overloads bind instead and path inference is preserved.

::: info Implementing these interfaces
Their methods are deliberately declared with **method-shorthand syntax** (`setValue(path: string, value: unknown): void`), so TypeScript checks the parameters **bivariantly**. That is what lets a `Form<TSchema>`, whose write methods take the narrower `FieldPath<...>` instead of `string`, satisfy the string-typed interface. Two consequences if you implement one of these shapes yourself:

- Your implementation **must accept any string path at runtime**. The compiler will not stop a caller from passing a path outside whatever narrower type you had in mind.
- Do **not** re-declare these shapes with arrow-property syntax (`setValue: (path: string, ...) => void`). Property function types are checked contravariantly, which makes `Form<TSchema>` unassignable to your copy.
- `FieldArrayFormApi.validateField` is **optional** and opt-in. When present, `useFieldArray`'s ops (`push`, `remove`, and the rest) call it to revalidate the array path under the form's validation gate, which is what keeps array-level errors such as `min` and `max` live as rows change. A `Form<TSchema>` always provides it. A hand-rolled implementation without it keeps working, but its ops skip revalidation and array-level errors only refresh on the next explicit validate or submit.
:::
