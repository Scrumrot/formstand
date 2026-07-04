# Examples

Every feature has a working, interactive demo in the **[live playground](https://scrumrot.github.io/formstand/examples/)** — the same app you get locally with `npm run examples`. Each tab below runs against the real library; the linked source is the complete, unabridged implementation.

| Demo | What it shows | Source |
| --- | --- | --- |
| Basic + modes | The smallest real form, plus a live switcher for every validation mode (`onChange`/`onBlur`/`onSubmit`/`onTouched`/`all`) and `reValidateMode` | [BasicForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/BasicForm.tsx) |
| Bound fields | All four shipped components — `TextField`, `NumberField`, `SelectField`, `CheckboxField` — with their a11y wiring, `validateOnMount`, a `useIsValid`-gated submit, and `focusFirstError` | [BoundFieldsForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/BoundFieldsForm.tsx) |
| Form context | `createFormContext`: zero prop drilling with typed paths intact, all four flag hooks as a status bar, `useFormError`, and `adoptValues` as the post-save rebase | [ContextForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/ContextForm.tsx) |
| Nested + submit | Nested object paths and the full `handleSubmit` flow | [NestedForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/NestedForm.tsx) |
| Field array | `useFieldArray` basics: push, remove, reorder with stable row IDs | [ArrayForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/ArrayForm.tsx) |
| Async | An `async .refine` username check with `debounceMs`, `isValidating` spinners, and race handling | [AsyncForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/AsyncForm.tsx) |
| Wizard | A multi-step form gating each step on its own fields with `validateFields` | [WizardForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/WizardForm.tsx) |
| Conditional | Fields that appear based on other fields' values | [ConditionalForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/ConditionalForm.tsx) |
| Invoice | A larger, realistic form: line-item arrays with derived totals | [InvoiceForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/InvoiceForm.tsx) |
| Nested arrays | Arrays inside array rows, with IDs stable at both levels | [NestedArraysForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/NestedArraysForm.tsx) |
| Server errors | The [server error channel](./errors): errors that survive background revalidation and release when you edit the field | [ServerErrorsForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/ServerErrorsForm.tsx) |
| Autosave | Draft persistence with `watchValues` + localStorage, restored on mount, with `dirtyFields()` reporting what changed | [AutosaveForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/AutosaveForm.tsx) |
| Dependent | Cross-field reactions with `watchValue` | [DependentFieldsForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/DependentFieldsForm.tsx) |
| Optimistic | Optimistic UI with `snapshot()`/`restore()` rollback | [OptimisticForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/OptimisticForm.tsx) |
| File upload | File inputs and validating `File` values | [FileUploadForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/FileUploadForm.tsx) |
| Derived | Computed values via selectors — consistent by construction, never stored | [DerivedFieldForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/DerivedFieldForm.tsx) |
| Tags | A tag input over an array of primitives | [TagInputForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/TagInputForm.tsx) |
| Perf | A 200-row stress test showing per-field re-render isolation | [PerfBenchmarkForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/PerfBenchmarkForm.tsx) |

## Running locally

```bash
git clone https://github.com/Scrumrot/formstand
cd formstand && npm install
npm run examples
```

The playground aliases `formstand` to the library source, so edits to `src/` hot-reload straight into the demos.
