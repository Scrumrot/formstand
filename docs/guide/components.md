# Bound components

This page covers the four bound input components (`TextField`, `NumberField`, `CheckboxField`, `SelectField`), the accessibility wiring they ship with, the prop builders for custom markup, `NumberField`'s partial-entry behavior, and how cleared inputs decide between `null` and `undefined`.

## The four components

```tsx
import { TextField, NumberField, CheckboxField, SelectField } from "formstand";

<TextField form={form} path="email" label="Email" type="email" />
<NumberField form={form} path="age" label="Age" />
<CheckboxField form={form} path="agree" label="I agree" />
<SelectField
  form={form}
  path="theme"
  label="Theme"
  placeholder="Pick a theme"
  options={[
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ]}
/>
```

Props:

| Component | Props |
| --- | --- |
| `TextField` | `form`, `path`, `label?`, `placeholder?`, `type?` (`"text" \| "password" \| "email" \| "url" \| "tel"`), `autoComplete?`, `ref?` |
| `NumberField` | `form`, `path`, `label?`, `placeholder?`, `ref?` |
| `CheckboxField` | `form`, `path`, `label?`, `ref?` |
| `SelectField<T>` | `form`, `path`, `label?`, `options` (`{ value: T; label: ReactNode }[]`), `placeholder?`, `ref?` |

Each renders a `div.zf-field` wrapping an optional `<label>` (correctly associated via `htmlFor`/`id`), the input, and the field's first error message in a `span.zf-error` — style them with those class names.

## Accessibility wiring

Every bound component ships with:

- `name={path}` — enables autofill, password managers, native form posts, and [`focusFirstError`](./errors#focusing-the-first-error).
- `aria-invalid` while the field has an error.
- `aria-describedby` pointing at the rendered error message's id.
- The error message rendered with `role="alert"`, so assistive tech announces it when it appears.
- A `ref` prop forwarding to the underlying `<input>`/`<select>` (object refs and callback refs both work), for custom focus logic.

## Prop builders for custom markup

When you want your own markup, the same bindings are available as pure functions over a `useField` result:

```tsx
import { useField, textInputProps, checkboxProps, selectProps, numberInputProps } from "formstand";

const name = useField(form, "name");

<input {...textInputProps(name)} />
<input {...checkboxProps(useField(form, "agree"))} />
<select {...selectProps(useField(form, "theme"))}>
  <option value="">—</option>
  <option value="light">Light</option>
</select>
<input {...numberInputProps(useField(form, "age"))} step="1" />
```

Each builder spreads `name`, the controlled `value`/`checked`, `aria-invalid`, `onChange`, and `onBlur` (which marks the field touched and triggers mode-appropriate validation). Error display, labels, and `aria-describedby` are yours to render.

`numberInputProps` is a *stateless* `<input type="number">` binding — you get the native stepper and `step` attribute, at the cost of the intermediate-entry behavior described next.

## `NumberField` and partial entries

A controlled `<input type="number">` coerces away intermediate text like `-` or `1e` mid-keystroke. `NumberField` avoids this by rendering a `type="text"` input with `inputMode="decimal"` and keeping the raw text locally while you type:

- Each keystroke that parses to a **finite** number is pushed to the form immediately.
- Partial entries (`-`, `1.`, `1e`) are kept as local text and the form value is left untouched.
- Whitespace-only text counts as **empty** and writes the field's `emptyValue` (`Number("  ")` would otherwise be `0`).
- `Infinity` is rejected — kept as text, never pushed.
- On blur, the display snaps to the canonical form value.
- If something else writes the field while you're typing (`reset`, `adoptValues`, another component), the external value wins and the input updates immediately.

## Empty values: `null` vs `undefined`

What should a cleared input write back? `useField` answers by **introspecting the zod schema** at the field's path and exposing the result as `field.emptyValue`:

- `.nullable()` (and not optional) → clearing writes `null`, so `z.number().nullable()` round-trips to a valid blank instead of an `undefined` the schema rejects.
- `.optional()` → clearing writes `undefined` (also the default for unrecognized shapes).
- For schema-less forms (a bare `FieldFormApi` without a schema), it falls back to a runtime heuristic: `null` if the field's *initial value* was `null`, else `undefined`.

The builders use it consistently: `numberInputProps` and `NumberField` write `emptyValue` when the text is empty; `textInputProps` and `selectProps` write `null` on a cleared value when `emptyValue` is `null` (a non-nullable text field cleared to `""` just stays `""`).

## `SelectField` placeholder and null handling

A native `<select>` with a value that matches no option silently *displays* the first option while your state says otherwise. `SelectField` stays controlled by rendering a disabled empty `<option value="">` whenever the field value is `undefined` or `null` (or whenever you pass `placeholder`), showing your `placeholder` text if given:

```tsx
<SelectField
  form={form}
  path="country"        // z.string().nullable() — "not chosen" is null
  placeholder="Choose a country"
  options={countries}
/>
```

Choosing a real option writes its `value`; for a nullable field, re-selecting the empty option writes `null` (per `emptyValue` above).

## Next

- [Typed paths](./typed-paths) — why `NumberField` beats `z.coerce.number()`.
- [Errors: schema & server](./errors) — where the error messages these components render come from.
