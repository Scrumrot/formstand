# Custom templates

For a UI kit formstand doesn't ship, an in-house design system being the usual case, a **template** overrides the per-kind field rendering while inheriting everything else the generator produces: sections, arrays, discriminated unions, submit wiring. A UI kit differs in its field components, not in the form skeleton.

```ts
// acme.template.ts
import { defineTemplate } from "formstand-cli";

export default defineTemplate({
  name: "acme",
  imports: [{ from: "@acme/ui", names: ["TextInput", "NumberInput", "Select"] }],
  leaf: {
    string: ({ label, bind }) => `<TextInput label={${label}} {...${bind}} />`,
    number: ({ label, bind }) => `<NumberInput label={${label}} {...${bind}} />`,
    enum: ({ label, bind, options }) => `<Select label={${label}} data={${options}} {...${bind}} />`,
    // string / number / boolean / date / enum
  },
});
```

```bash
npx formstand-gen src/profileSchema.ts --template ./acme.template.ts --out src/ProfileForm.tsx
```

## The renderer context

Each `leaf` renderer receives a context whose fields are **JS-expression strings** to splice into your control's JSX:

| Field | What it is |
| --- | --- |
| `bind` | the formstand prop-builder spread (`textInputProps(field)` and friends), carrying `name`, `value`, `onChange`, `onBlur`, `aria-invalid`. Spread it: `{...${bind}}` |
| `field` | the bound `useField` result variable; reference `.error` or `.value` for custom error display |
| `label` | the field label as an expression, so write `label={${label}}` |
| `options` | enum only: a `string[]` expression, so `data={${options}}` |
| `description` | the field's captured `.describe()` or JSDoc text as a `string \| undefined` expression, and `""` when the schema carries none. Gate your markup on it |

Unlisted kinds fall back to the plain output, so a template can override only the kinds its kit actually changes.

## Rules and limits

- `--template` overrides `--ui`.
- It currently supports `--layout single` only. Module support is planned.
- A [per-field override](./config#per-field-component-overrides) wins over the template for that one field, since the field has opted out of its kind. Every other field still routes through the template.
- Set a project default with `template: "./acme.template.ts"` in `formstand.config.ts`.

If your kit is one of the six built-in backends, use [`--ui`](./ui-kits) instead. The built-in backends handle error slots, section chrome, and the number-input dance per kit, which a template inherits from the plain output rather than getting for free.
