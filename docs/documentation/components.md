# Bound components

This page covers the five bound input components (`TextField`, `NumberField`, `DateField`, `CheckboxField`, `SelectField`), the accessibility wiring they ship with, the prop builders for custom markup, `NumberField`'s partial-entry behavior, and how cleared inputs decide between `null` and `undefined`.

## The five components

```tsx
import {
  TextField,
  NumberField,
  DateField,
  CheckboxField,
  SelectField,
} from "formstand";

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
| `DateField` | `form`, `path`, `label?`, `min?`, `max?`, `ref?` |
| `CheckboxField` | `form`, `path`, `label?`, `ref?` |
| `SelectField<T>` | `form`, `path`, `label?`, `options` (`{ value: T; label: ReactNode }[]`), `placeholder?`, `ref?` |

Each renders a `div.zf-field` wrapping an optional `<label>` (correctly associated via `htmlFor`/`id`), the input, and the field's first error message in a `span.zf-error`. Style them with those class names.

## Accessibility wiring

Every bound component ships with:

- `name={path}` enables autofill, password managers, native form posts, and [`focusFirstError`](./errors#focusing-the-first-error).
- `aria-invalid` while the field has an error.
- `aria-describedby` pointing at the rendered error message's id.
- The error message rendered with `role="alert"`, so assistive tech announces it when it appears.
- A `ref` prop forwarding to the underlying `<input>`/`<select>` (object refs and callback refs both work), for custom focus logic. For "focus this field now" you rarely need one, since [`focusField(path)`](./recipes#focus-a-field-imperatively) finds the control by its `name`.

Because every bound component takes the `form` itself, `path` is checked against the schema: on a real `Form<TSchema>` a typo'd `path` is a compile error, and template-literal paths like `` `users.${index}.email` `` in array rows still typecheck, following the same rules as [typed paths](./typed-paths) everywhere else.

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

`numberInputProps` is a *stateless* `<input type="number">` binding, so you get the native stepper and the `step` attribute, at the cost of the intermediate-entry behavior described next.

## `DateField` and calendar-date semantics

`DateField` renders `<input type="date">` bound to a `Date`-typed field. Display and parsing go through the exported `dateToInputText` and `parseDateText` rules, which treat the value as a **local calendar date**: the input's `"yyyy-MM-dd"` maps to local midnight, never through `toISOString()`, because a date picked as June 1 must not render as May 31 for users west of UTC. Clearing writes the field's `emptyValue` (`null` for `z.date().nullable()`), rollover text like `2026-02-31` is rejected rather than silently becoming March 3, and `dateInputProps` is exported for custom markup and UI-kit adapters. For picker widgets, bind MUI X's `DatePicker` or shadcn's `Calendar` with a small adapter that reuses these same two functions.

## Discriminated unions

A `z.discriminatedUnion` field types its value as a union of variant objects. The **discriminant**, the key present in every variant, binds with plain `useField`, since it is a common key and fully typed. The **variant-specific** fields, present in only some branches, live at paths `FieldPath` omits, so `useVariantField` binds those:

```tsx
const schema = z.object({
  payment: z.discriminatedUnion("method", [
    z.object({ method: z.literal("card"), cardNumber: z.string() }),
    z.object({ method: z.literal("paypal"), email: z.string() }),
  ]),
});

function PaymentFields({ form }: { form: Form<typeof schema> }) {
  const method = useField(form, "payment.method");          // typed "card" | "paypal"
  const cardNumber = useVariantField(form, "payment", "cardNumber"); // string | undefined
  const email = useVariantField(form, "payment", "email");           // string | undefined
  return (
    <>
      <SelectField form={form} path="payment.method" options={[
        { value: "card", label: "Card" },
        { value: "paypal", label: "PayPal" },
      ]} />
      {method.value === "card" ? <input {...textInputProps(cardNumber)} /> : null}
      {method.value === "paypal" ? <input {...textInputProps(email)} /> : null}
    </>
  );
}
```

`useVariantField(form, unionPath, field)` types the result as the field's value across the variants that declare it, widened with `| undefined`, since the field is absent while a different variant is active. A field name no variant declares, or the discriminant itself, is a compile error. Call it unconditionally (React's rules) and render the matching fields based on the discriminant. `createFormHooks` exposes a bound `use{Name}VariantField`, and `formstand-gen` generates this shape for discriminated-union fields.

The union path can be row-indexed. A union that is an **array's row item** binds the same way from inside a row component, with a template path:

```tsx
const kind = useField(form, `pavements.${index}.pavementType`);
const designator = useVariantField(form, `pavements.${index}`, "designator");
```

Both the `` `pavements.${number}` `` template and a literal `"pavements.0"` resolve the row's variant keys (formstand 0.16 and newer; older versions collapse the field argument to `never` on any indexed path).

## Composite fields: `useFields`

One control backed by several schema paths — a coordinate pair behind a single map-driven input, a range's min and max, a date span — binds them together with `useFields`:

```tsx
const location = useFields(form, ["latitude", "longitude"]);
const [latitude, longitude] = location.fields; // full, typed field bindings

<DmsInput lat={latitude} lng={longitude} onBlur={location.onBlur} />
<span>{location.firstError}</span>             // the combined error line
```

Each element of `fields` is a complete `useField` result, position-typed from the tuple, so it spreads into the same prop builders and components a solo binding would. The wrapper adds the combined view: `error` merges every path's messages in path order and dedupes them, so a cross-field `superRefine` that stamps both paths reads once; `firstError` is its display shorthand; `touched`, `dirty`, and `isValidating` answer "any of them"; and `onBlur` blurs every path under the form's validation mode, so the composite behaves like one control losing focus.

The paths tuple is part of the hook contract: it expands to exactly that many `useField` calls, so its length and order must be stable across renders. Pass a literal or a module-level constant — a tuple that changes length throws React's own hooks-count error at the offending render.

## `NumberField` and partial entries

A controlled `<input type="number">` coerces away intermediate text like `-` or `1e` mid-keystroke. `NumberField` avoids this by rendering a `type="text"` input with `inputMode="decimal"` and keeping the raw text locally while you type:

- Each keystroke that parses to a **finite** number is pushed to the form immediately.
- Partial entries (`-`, `1.`, `1e`) are kept as local text and the form value is left untouched.
- Whitespace-only text counts as **empty** and writes the field's `emptyValue` (`Number("  ")` would otherwise be `0`).
- `Infinity` is rejected, kept as text and never pushed.
- On blur, the display snaps to the canonical form value.
- If something else writes the field while you're typing (`reset`, `adoptValues`, another component), the external value wins and the input updates immediately.

## Empty values: `null` vs `undefined`

What should a cleared input write back? `useField` answers by **introspecting the zod schema** at the field's path and exposing the result as `field.emptyValue`:

- `.nullable()` (and not optional) → clearing writes `null`, so `z.number().nullable()` round-trips to a valid blank instead of an `undefined` the schema rejects.
- `.optional()` → clearing writes `undefined` (also the default for unrecognized shapes).
- For schema-less forms (a bare `FieldFormApi` without a schema), it falls back to a runtime heuristic: `null` if the field's *initial value* was `null`, else `undefined`.

The builders use it consistently: `numberInputProps` and `NumberField` write `emptyValue` when the text is empty; `textInputProps` and `selectProps` write `null` on a cleared value when `emptyValue` is `null` (a non-nullable text field cleared to `""` just stays `""`). `checkboxProps` is the deliberate exception: a checkbox has exactly two visual states, so unchecking always writes `false`, because restoring `null` on uncheck would make `false` unreachable for a nullable boolean. If "unset" must be distinguishable from "no", use a select or radio group instead.

One known asymmetry to be aware of: for an **optional, non-nullable** string (`z.string().optional()`), clearing a text input writes `""`, not `undefined` — the binding cannot tell an optional field's `undefined` apart from a required field's (both read `emptyValue: undefined`), and writing `undefined` into a required string would break it far worse. So an optional text field that has been typed in and cleared holds `""` and reads dirty against an `undefined` initial. If your schema treats blank as absent, normalize in the schema itself: `z.string().transform((s) => (s === "" ? undefined : s)).optional()` or a `.preprocess` — the schema is the right owner of that rule.

## `SelectField` placeholder and null handling

A native `<select>` with a value that matches no option silently *displays* the first option while your state says otherwise. `SelectField` stays controlled by rendering an empty `<option value="">` whenever the bound `<select>` displays `""`, which covers `undefined`, `null`, and `""` field values (the condition derives from `selectProps`' own value coercion), or whenever you pass `placeholder`, in which case your placeholder text shows. For a **nullable** field the empty option is also selectable and stays visible after a choice, so picking it clears the field back to `null` through the `emptyValue` round trip; everywhere else it is a disabled placeholder. One override: if your `options` list itself contains a `""`-valued entry, that explicit, labelled option **is** the blank state, so the implicit option and the `placeholder` are suppressed and the browser can't pair the value with an unlabelled duplicate:

```tsx
<SelectField
  form={form}
  path="country"        // z.string().nullable(), so "not chosen" is null
  placeholder="Choose a country"
  options={countries}
/>
```

Choosing a real option writes its `value`; for a nullable field, re-selecting the empty option writes `null` (per `emptyValue` above).

## Next

- [Typed paths](./typed-paths): why `NumberField` beats `z.coerce.number()`.
- [Errors: schema & server](./errors): where the error messages these components render come from.
