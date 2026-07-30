# Components and bindings

The shipped components, the prop builders behind them, and the focus helpers. The narrative version is [Bound components](../components).

## Components

All bound components render `name={path}`, `aria-invalid`, `aria-describedby`, and the error with `role="alert"`, and accept a `ref` to the underlying element. Their `path` prop is typed against the form: passing a real `Form<TSchema>` narrows it to the schema's `FieldPath` union, so typos are compile errors while template-literal array paths still typecheck. A structural `FieldFormApi` keeps plain `string`. The `PathsOf<F>` type captures this rule.

| Component | Props type | Element |
| --- | --- | --- |
| `TextField` | `TextFieldProps` | `input` (`text`/`password`/`email`/`url`/`tel`) |
| `NumberField` | `NumberFieldProps` | `input type="text" inputMode="decimal"` with partial-entry handling |
| `DateField` | `DateFieldProps` (adds `min?`, `max?`) | `input type="date"` bound to a `Date`-typed field |
| `CheckboxField` | `CheckboxFieldProps` | `input type="checkbox"` |
| `SelectField` | `SelectFieldProps<T>` (`options: SelectFieldOption<T>[]`, `placeholder?`) | `select`, stays controlled while empty |

## Prop builders

Pure functions over a `useField` result, for custom markup:

| Builder | Returns | Spread onto |
| --- | --- | --- |
| `textInputProps(field)` | `TextInputProps` | `<input>` / `<textarea>` |
| `numberInputProps(field)` | `NumberInputProps` | `<input>` (stateless `type="number"` binding) |
| `dateInputProps(field)` | `DateInputProps` | `<input type="date">` |
| `checkboxProps(field)` | `CheckboxProps` | `<input>` |
| `selectProps(field)` | `SelectProps` | `<select>` |

The rules the built-in bindings follow are exported alongside them, so adapters for other UI kits can share them instead of re-deriving. See [Bound components](../components).

| Helper | Signature | Notes |
| --- | --- | --- |
| `numberToInputText` | `(value: number \| null \| undefined) => string` | canonical display text for a numeric field value (`""` for empty, `null`, or `NaN`) |
| `parseNumberText` | `(text: string) => ParsedNumberText` | classifies user-typed text: `{ kind: "number", value }` for a finite number, `{ kind: "empty" }` for whitespace-only, `{ kind: "invalid" }` for partial entries (`-`, `1.`, `1e`) and `Infinity` |
| `emptyValueForSchema` | `(schema: z.ZodType) => null \| undefined` | the empty representation a field's schema accepts: `null` when nullable and not optional, `undefined` otherwise. This is the schema-introspection rule behind [`useField().emptyValue`](./hooks#usefieldreturn-tvalue) |
| `dateToInputText` | `(value: Date \| null \| undefined) => string` | canonical `"yyyy-MM-dd"` text for a date field value (`""` for empty, `null`, or an invalid `Date`), read from the **local** calendar parts |
| `parseDateText` | `(text: string) => ParsedDateText` | classifies date-input text: `{ kind: "date", value }` at local midnight, `{ kind: "empty" }`, or `{ kind: "invalid" }` for anything that isn't `"yyyy-MM-dd"` or whose parts roll over, such as `2026-02-31` |
| `hasFieldError` | `(error: readonly string[] \| undefined) => boolean` | the single predicate for "does this field currently show an error", used by the built-in bindings for `aria-invalid` and error rendering, so an adapter's notion of showing an error can't drift from the library's |

The date pair is the reason a `DateField` value is a **calendar date** rather than an instant. `parseDateText` builds local midnight, because `new Date("2026-06-01")` is UTC midnight and reads back as May 31 anywhere west of Greenwich. Any adapter binding a date picker should go through these two rather than `toISOString()`.

## `useNumberInput(field)`

The text-preserving number binding behind `NumberField`, exported for custom number inputs and UI-kit adapters. It takes a `UseFieldReturn<number | null | undefined>` and returns a `NumberInputBinding` (`name`, `value`, `inputMode: "decimal"`, `aria-invalid`, `onChange`, `onBlur`) to spread onto an `<input type="text">`.

Raw text stays in local state while it doesn't parse, so partial entries like `-`, `1.`, and `85000.` stay visible. Keystrokes that do parse push the number to the form, blur snaps the display back to the canonical value, and an external form-value change while editing resets the local text. A naive controlled `value={String(n)}` input eats the `.` of `85000.50` and the `-` of `-5` as they are typed; this hook is the fix. The stateless `numberInputProps` builder above stays the right choice for `type="number"` inputs, where the browser holds partial entries itself.

## `focusFirstError(errors, root?)`

Focuses the first control in DOM order whose `name` matches an errored path, either exactly or as a descendant of an errored container path.

An errored path that matches no named control at all additionally tries the element whose `id` is exactly that path (exact match only, with no descendant semantics for ids). That is how composite widgets that render no `name` anywhere, like Ant Design's `Select` with `id={path}`, still receive focus.

Most specific wins: the root `""` error falls back to the first control only when no field-keyed error matches, and with the default `document` scope that fallback is refused (returns `false`) when the page holds more than one `<form>`, since "first control" would be ambiguous. On multi-form pages, pass the form element as `root`, for example via a ref.

It skips controls that can't take focus (hidden, disabled, inside a closed `<dialog>`) and verifies focus actually landed, trying the next match otherwise. Returns `true` only when a control really holds focus. Safe to import in SSR.

## `focusField(path, root?)`

The imperative sibling of `focusFirstError`, keyed by a path instead of an error map. It focuses the first control in DOM order whose `name` is `path` itself or a descendant of it, so `focusField("address")` lands on the first rendered address field. As with `focusFirstError`, a path matching no named control falls back to the element whose `id` is exactly the path.

The root `""` path is whole-form scope, consistent with `validateField("")` and `resetField("")`: it focuses the first focusable control in scope, and like `focusFirstError`'s root fallback it refuses to guess (returns `false`) under the default `document` scope when the page holds more than one `<form>`. Pass the form element as `root` there.

Same focusability rules and the same optional `root` scoping; returns whether a control actually received focus. Use it where react-hook-form users reach for `setFocus`: after opening a dialog, appending an array row, or landing on a wizard step. See the [recipe](../recipes#focus-a-field-imperatively).
