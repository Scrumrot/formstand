# Examples

Every feature has a working, interactive demo in the **[live playground](https://scrumrot.github.io/formstand/examples/)** — the same app you get locally with `npm run examples`. Each tab below runs against the real library; the linked source is the complete, unabridged implementation.

| Demo | What it shows | Source |
| --- | --- | --- |
| Basic + modes | The smallest real form, plus a live switcher for every validation mode (`onChange`/`onBlur`/`onSubmit`/`onTouched`/`all`) and `reValidateMode` | [BasicForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/BasicForm.tsx) |
| Bound fields | All four shipped components — `TextField`, `NumberField`, `SelectField`, `CheckboxField` — with their a11y wiring, `validateOnMount`, a `useIsValid`-gated submit, and `focusFirstError` | [BoundFieldsForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/BoundFieldsForm.tsx) |
| Form context | `createFormContext`: zero prop drilling with typed paths intact, all four flag hooks as a status bar, `useFormError`, and `adoptValues` as the post-save rebase | [ContextForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/ContextForm.tsx) |
| Hooks factory | `createFormHooks(form, "invoice")`: a module-singleton form baked into exported hooks (`useInvoiceField`…) — no provider, no `form` prop anywhere | [HooksFactoryForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/forms/HooksFactoryForm.tsx) |
| Onboarding | A 26-field, five-section **feature module**: `schema.ts` → `hooks.ts` (`createFormHooks`) → one file per field, one per section, with path-scoped `useIsDirty`/`useIsValid` badges per section header | [OnboardingForm/](https://github.com/Scrumrot/formstand/tree/main/examples/src/forms/OnboardingForm) |
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

## Material UI

Five demos bind formstand to [Material UI](https://mui.com/) through a ~60-line adapter — [muiAdapter.ts](https://github.com/Scrumrot/formstand/blob/main/examples/src/mui/muiAdapter.ts) turns a `useField` result into spreadable props for `TextField`, `Select`, `Switch`, and `Slider`, reusing the library's exported `parseNumberText`/`numberToInputText` rules. Nothing MUI-specific lives in the library; this is the pattern to copy for any third-party UI kit. All five run in the same [live playground](https://scrumrot.github.io/formstand/examples/).

| Demo | What it shows | Source |
| --- | --- | --- |
| MUI: Checkout | A `Stepper` wizard gating each step with `validateFields`, a "billing same as shipping" `Switch` that copies values, and a review step read from a selector | [MuiCheckoutWizard.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/mui/MuiCheckoutWizard.tsx) |
| MUI: Job form | `Autocomplete multiple` over a string-array field, a salary `Slider`, an async email check with a `CircularProgress` adornment, and a server rejection via `form.setError` | [MuiJobApplication.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/mui/MuiJobApplication.tsx) |
| MUI: Invoice | `useFieldArray` rendered as a MUI `Table` with reorder/delete `IconButton`s, derived totals, an array-level error `Alert`, and a dirty-gated save that rebases with `adoptValues` | [MuiInvoiceBuilder.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/mui/MuiInvoiceBuilder.tsx) |
| MUI: Settings | Card-sectioned settings with a nullable bio (clearing the field round-trips to `null` via `emptyValue`), live `dirtyFields()` chips, and Save/Discard as `adoptValues`/`reset()` | [MuiProfileSettings.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/mui/MuiProfileSettings.tsx) |
| MUI: Survey | Nested field arrays (sections → questions) with type-switched sub-editors and a root-level refine surfaced through `useFormError` | [MuiSurveyBuilder.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/mui/MuiSurveyBuilder.tsx) |

## shadcn/ui

Four demos bind formstand to [shadcn/ui](https://ui.shadcn.com/) components. shadcn's `Input` and `Textarea` take native DOM events, so the library's own exported `textInputProps`/`numberInputProps` bind them with nothing extra — the adapter file, [shadcnAdapter.ts](https://github.com/Scrumrot/formstand/blob/main/examples/src/shadcn/shadcnAdapter.ts), only bridges the Radix dialect: `Checkbox`, `Switch`, `Select`, `Slider`, and `RadioGroup` take value-first callbacks (`onCheckedChange`, `onValueChange`) and signal "done editing" through close/commit events instead of blur. Errors surface as `aria-invalid`, which the components style themselves off. `formstand-gen --ui shadcn` generates forms against this pattern.

| Demo | What it shows | Source |
| --- | --- | --- |
| shadcn: Signup | An async `.refine` username check isolated to its field's subschema, a cross-field password confirmation, and a must-accept `Checkbox` | [ShadcnSignupForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/shadcn/ShadcnSignupForm.tsx) |
| shadcn: Checkout | Radix `Select` and `RadioGroup` via `onValueChange`, a derived total from a selector, and a nullable gift note that round-trips to `null` via `emptyValue` | [ShadcnCheckoutForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/shadcn/ShadcnCheckoutForm.tsx) |
| shadcn: Settings | `Switch` and `Slider` bindings (validation waits for `onValueCommit`), live `dirtyFields()` badges, Save/Discard as `adoptValues`/`reset()` | [ShadcnSettingsForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/shadcn/ShadcnSettingsForm.tsx) |
| shadcn: Team | `useFieldArray` rows (one component per row, so edits don't re-render siblings) with a cross-row duplicate-email `superRefine` | [ShadcnTeamForm.tsx](https://github.com/Scrumrot/formstand/blob/main/examples/src/shadcn/ShadcnTeamForm.tsx) |

The playground bundles its own copies of the shadcn components (they're copy-in code by design); in your app, `npx shadcn add button input label checkbox select …` scaffolds them and the adapter works unchanged.

## Browse the source inline

Every block below embeds the demo's actual source file at build time, so it can never drift from what the playground runs. Two lines in each demo are playground harness, not library API: `import { useDemoForm } from "../demo/DemoShell"` and the `useDemoForm(form)` call register the demo's form with the playground shell, which is what powers the **View state** panel (rendered by `StateDump.tsx` below). Delete those two lines when copying a demo into your own project — everything else is plain formstand.

::: details Basic + modes — BasicForm.tsx
<<< ../../examples/src/forms/BasicForm.tsx
:::

::: details Bound fields — BoundFieldsForm.tsx
<<< ../../examples/src/forms/BoundFieldsForm.tsx
:::

::: details Form context — ContextForm.tsx
<<< ../../examples/src/forms/ContextForm.tsx
:::

::: details Hooks factory — HooksFactoryForm.tsx
<<< ../../examples/src/forms/HooksFactoryForm.tsx
:::

### Onboarding — the feature-module layout

One folder per form: `schema.ts` (zod + select options), `types.ts`, `hooks.ts` (`createForm` + `createFormHooks`), one file per field (props type + field hook + component), one file per section (props type + section hook built on the path-scoped flags + component). The key files:

::: details hooks.ts — the module's pre-wired hooks
<<< ../../examples/src/forms/OnboardingForm/hooks.ts
:::

::: details schema.ts — schema + select options as one source of truth
<<< ../../examples/src/forms/OnboardingForm/schema.ts
:::

::: details A field file — CityField.tsx
<<< ../../examples/src/forms/OnboardingForm/fields/CityField.tsx
:::

::: details A section file — PersonalSection.tsx
<<< ../../examples/src/forms/OnboardingForm/sections/PersonalSection.tsx
:::

::: details The form body — OnboardingForm.tsx
<<< ../../examples/src/forms/OnboardingForm/OnboardingForm.tsx
:::

::: details Nested + submit — NestedForm.tsx
<<< ../../examples/src/forms/NestedForm.tsx
:::

::: details Field array — ArrayForm.tsx
<<< ../../examples/src/forms/ArrayForm.tsx
:::

::: details Async — AsyncForm.tsx
<<< ../../examples/src/forms/AsyncForm.tsx
:::

::: details Wizard — WizardForm.tsx
<<< ../../examples/src/forms/WizardForm.tsx
:::

::: details Conditional — ConditionalForm.tsx
<<< ../../examples/src/forms/ConditionalForm.tsx
:::

::: details Invoice — InvoiceForm.tsx
<<< ../../examples/src/forms/InvoiceForm.tsx
:::

::: details Nested arrays — NestedArraysForm.tsx
<<< ../../examples/src/forms/NestedArraysForm.tsx
:::

::: details Server errors — ServerErrorsForm.tsx
<<< ../../examples/src/forms/ServerErrorsForm.tsx
:::

::: details Autosave — AutosaveForm.tsx
<<< ../../examples/src/forms/AutosaveForm.tsx
:::

::: details Dependent — DependentFieldsForm.tsx
<<< ../../examples/src/forms/DependentFieldsForm.tsx
:::

::: details Optimistic — OptimisticForm.tsx
<<< ../../examples/src/forms/OptimisticForm.tsx
:::

::: details File upload — FileUploadForm.tsx
<<< ../../examples/src/forms/FileUploadForm.tsx
:::

::: details Derived — DerivedFieldForm.tsx
<<< ../../examples/src/forms/DerivedFieldForm.tsx
:::

::: details Tags — TagInputForm.tsx
<<< ../../examples/src/forms/TagInputForm.tsx
:::

::: details Perf — PerfBenchmarkForm.tsx
<<< ../../examples/src/forms/PerfBenchmarkForm.tsx
:::

::: details State dump panel — StateDump.tsx
<<< ../../examples/src/forms/StateDump.tsx
:::

### Material UI demos

::: details The adapter (muiAdapter.ts) — muiAdapter.ts
<<< ../../examples/src/mui/muiAdapter.ts
:::

::: details Theme bridge — MuiThemeBridge.tsx
<<< ../../examples/src/mui/MuiThemeBridge.tsx
:::

::: details MUI: Checkout — MuiCheckoutWizard.tsx
<<< ../../examples/src/mui/MuiCheckoutWizard.tsx
:::

::: details MUI: Job form — MuiJobApplication.tsx
<<< ../../examples/src/mui/MuiJobApplication.tsx
:::

::: details MUI: Invoice — MuiInvoiceBuilder.tsx
<<< ../../examples/src/mui/MuiInvoiceBuilder.tsx
:::

::: details MUI: Settings — MuiProfileSettings.tsx
<<< ../../examples/src/mui/MuiProfileSettings.tsx
:::

::: details MUI: Survey — MuiSurveyBuilder.tsx
<<< ../../examples/src/mui/MuiSurveyBuilder.tsx
:::

### shadcn/ui demos

::: details The adapter (shadcnAdapter.ts) — shadcnAdapter.ts
<<< ../../examples/src/shadcn/shadcnAdapter.ts
:::

::: details Shared error helpers (used by both adapters) — fieldErrors.ts
<<< ../../examples/src/fieldErrors.ts
:::

::: details Error line — FieldError.tsx
<<< ../../examples/src/shadcn/FieldError.tsx
:::

::: details shadcn: Signup — ShadcnSignupForm.tsx
<<< ../../examples/src/shadcn/ShadcnSignupForm.tsx
:::

::: details shadcn: Checkout — ShadcnCheckoutForm.tsx
<<< ../../examples/src/shadcn/ShadcnCheckoutForm.tsx
:::

::: details shadcn: Settings — ShadcnSettingsForm.tsx
<<< ../../examples/src/shadcn/ShadcnSettingsForm.tsx
:::

::: details shadcn: Team — ShadcnTeamForm.tsx
<<< ../../examples/src/shadcn/ShadcnTeamForm.tsx
:::

## Running locally

```bash
git clone https://github.com/Scrumrot/formstand
cd formstand && npm install
npm run examples
```

The playground aliases `formstand` to the library source, so edits to `src/` hot-reload straight into the demos.
