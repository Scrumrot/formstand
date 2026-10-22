# formstand starter (Vite + React)

A minimal app with one schema-driven form: Vite, React 19, zod 4, zustand 5 and formstand, plus formstand-cli as a dev dependency so the same schema can generate the component.

```bash
npx degit Scrumrot/formstand/templates/vite-react my-form-app
cd my-form-app
npm install
npm run dev
```

What is in it:

- `src/schema.ts`: the zod schema and its initial values. This is the source of truth; the form's types, validation and field paths come from it.
- `src/App.tsx`: the form, written by hand with formstand's bound components (`TextField`, `NumberField`, `SelectField`, `CheckboxField`), a validity-aware submit and `focusFirstError`.
- `src/styles.css`: styling for the markup the bound components render (`.zf-field`, `.zf-label`, `.zf-error`).
- `npm run generate`: writes `src/SignupForm.tsx` from the same schema through formstand-cli, so you can compare the hand-written and generated forms, or switch to generating.

Next steps: the [documentation](https://scrumrot.github.io/formstand/documentation/) starts with [Getting started](https://scrumrot.github.io/formstand/documentation/getting-started) and [Typed paths](https://scrumrot.github.io/formstand/documentation/typed-paths); the [live playground](https://scrumrot.github.io/formstand/examples/) shows every feature running.
