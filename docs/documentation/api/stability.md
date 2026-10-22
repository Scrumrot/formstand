# Public API and stability

What formstand promises to keep, what it does not, and what happens when something has to change. This page is the contract the [roadmap's path to 1.0](https://github.com/Scrumrot/formstand/blob/main/ROADMAP.md#toward-10) asks for; the other API pages describe each export, this one says which exports are the API.

## Where things stand

0.18.0 was the last release with breaking changes. The soak toward 1.0 counts from 0.23.0: as long as no release carries a `### Changed` or `### Breaking` entry, 1.0.0 is 0.23.x plus a version number and the statement below. Both packages go to 1.0 together.

Semver, applied: a **major** removes or changes something on this page. A **minor** adds to it, or changes something marked internal. A **patch** fixes behaviour without changing a signature. The CHANGELOG's headings (`Breaking`, `Changed`, `Added`, `Fixed`) are the record, and `Changed` on a public surface means a deprecation (see the end of this page), never a silent edit.

## The `formstand` package

Everything exported from the main entry is public, with the type split the declaration file makes. The lists are generated from the built `dist/index.d.ts`; a name that is not here is not an API, even if an import path reaches it.

**Form construction and state.** `createForm`, `Form`, `CreateFormOptions`, `FormState`, `ErrorMap`, `BoolMap`, `FieldSnapshot`, `ReadonlyStoreApi`, `ResetOptions`, `SubmitHandler`, `InvalidSubmitHandler`, `SubmitOptions`, `SubmitResult`, `ValidationMode`, `ValidationTrigger`, `shouldValidateOn`. The store is ordinary zustand: reading it, subscribing to it and driving it from imperative code are supported uses, and the `FormState` shape (values, initial values, the two error channels and the derived `errors`, `touched`, `isValidating`, the mode fields, the submit counters) is part of the contract.

**Validation.** `validateSync`, `validateAsync`, `flattenIssues`, `isAsyncRequiredError`, `emptyValueForSchema`, `isClearableSchema`, and the result types `ValidationResult`, `SettledValidationResult`, `FieldValidationResult`, `SettledFieldValidationResult`, `FieldsValidationResult`, `SettledFieldsValidationResult`. The `kind` discriminants (`"valid"`, `"invalid"`, `"pending"`, `"skipped"`) are part of the contract: a new kind would be a breaking change.

**Paths.** `getAtPath`, `setAtPath`, `parsePath`, and the types `FieldPath`, `FieldValue`, `ArrayFieldPath`, `ArrayItemOf`, `PathSegment`, `PathDepth`, `DefaultPathDepth`, `PathsOf`, `PathsAccepting`, `ArrayPathsOf`, `SelectValueAt`, `VariantFieldPath`, `VariantFieldValue`, `VariantKeys`, `UnionValueAt`. The rules in [Typed paths](../typed-paths) (what a segment means, the depth budget, which keys are not addressable) are the specification these types implement.

**Hooks.** `useForm`, `useField`, `useFields`, `useFieldArray`, `useVariantField`, `useFormSelector`, `useFormSelectorShallow`, `useFormValues`, `useFormError`, `useIsDirty`, `useIsValid`, `useIsValidating`, `useIsSubmitting`, `useSubmitCount`, `useFormSteps`, `useFormAction`, `useFormActionState`, `useMaskedInput`, `useNumberInput`, `usePersistForm`, with their option and return types (`UseFieldOptions`, `UseFieldReturn`, `UseFieldsReturn`, `UseFieldArrayReturn`, `FieldArrayEntry`, `UseFormStepsReturn`, `FormStep`, `StepStatus`, `FormActionHandler`, `FormActionStateHandler`, `FormActionOptions`, `MaskedInputBinding`, `MaskedInputOptions`, `MaskedParse`, `NumberInputBinding`, `FieldPathArg`). A return shape only grows; a member is never removed or retyped in a minor.

**Context and factories.** `createFormContext`, `createFormHooks`, and `FormContextApi`, `FormProviderProps`, `FormHooks`, `BoundUseField`, `BoundUseFields`, `BoundUseFieldArray`, `BoundUseVariantField`, `BoundUseFlag`, `BoundUseSelector`. The bound hooks mirror the unbound returns, so the rule above covers them.

**Components and prop builders.** `TextField`, `NumberField`, `DateField`, `CheckboxField`, `SelectField` and their props types; `textInputProps`, `numberInputProps`, `dateInputProps`, `checkboxProps`, `selectProps` and the props they return (`TextInputProps`, `NumberInputProps`, `DateInputProps`, `CheckboxProps`, `SelectProps`); `numberToInputText`, `parseNumberText`, `dateToInputText`, `parseDateText`, `ParsedNumberText`, `ParsedDateText`; `hasFieldError`; `focusField`, `focusFirstError`; `FieldRef`, `SelectFieldOption`. The markup the components render, and the class names `zf-field`, `zf-label`, `zf-error` and `zf-help`, are a documented public surface: apps style them, and generated files carry them.

**Persistence.** `persistForm`, `PersistOptions`, `PersistHandle`, `PersistStorage`. The stored draft's shape is versioned through the `version` option, which is how a schema change invalidates old drafts deliberately.

**The structural form contracts.** `FieldFormApi`, `FormStateApi` and `FieldArrayFormApi` are what the hooks and components accept in place of a `Form`, so reusable components can be written against them. They follow one rule: a member added after the contract shipped is **optional** and is probed before use, so a hand-rolled implementation written against an earlier version keeps working and simply lacks the behaviour the new member backs. `validateField`, `setError`, `clearErrors`, `setTouched` and `setValue` on `FieldArrayFormApi` are the current examples.

## The `formstand/testing` and `formstand/devtools` entries

`formstand/testing` exports `fillField`, `blurField`, `fillAndBlurField`, `fillFields`, `submitForm`; all five are public, and the CLI's generated specs depend on them.

`formstand/devtools` exports `FormstandDevtools` with `FormstandDevtoolsProps` and `DevtoolsPosition`, plus `leafPaths` and `unmatchedErrorKeys`. The panel's **props** are the API; its markup and inline styles are not, and the production gate (renders nothing unless `enabled` says otherwise) is behaviour you may rely on.

## The `formstand-cli` package

**The command.** Every flag `formstand-gen --help` lists, with the value shapes it documents, and the exit codes (0 on success, 1 on any refusal or error). `--manifest` prints the same contract as data, and `--json`'s document shape (`{ ok, files: [{ path, content, written }], notes, error? }`) is public. A flag is removed only through the deprecation policy below, and keeps parsing for one major with a message naming its replacement.

**The config file.** `formstand.config.{ts,mts,js,mjs}` with `defineConfig`, and the keys of `FormstandConfig`: `ui`, `layout`, `sections`, `columns`, `live`, `formProp`, `template`, `fields` (the per-path override map and its option rules), `tests`.

**Templates.** `defineTemplate`, `Template`, `TemplateLeafContext`, `TemplateLeafKind`, `TemplateImport`, and the renderer context's fields.

**The programmatic API** (`formstand-cli/codegen`, browser-safe). `fromZod`, `isZodSchema`, the emitters (`emitZodSchema`, `emitInitialValues`, `emitPlainForm`, `emitMuiForm`, `emitShadcnForm`, `emitChakraForm`, `emitMantineForm`, `emitAntdForm`, `emitTemplateForm`, `emitModuleForm`, `joinModuleFiles`), `collectOptionsProps`, `applyFieldOverrides`, `parseFieldOverrides`, `parseUiTarget`, `labelFromName`, the casing helpers, the constants `DEFAULT_VISUAL`, `DEFAULT_MUI_VERSION`, `MUI_VERSIONS`, and the types `FieldSpec`, `NamedField`, `SharedSpecProps`, `UnionVariant`, `FieldOverrideSpec`, `FieldOverrides`, `FieldOverrideConfig`, `SchemaImport`, `EmitFormOptions`, `EmitModuleOptions`, `ModuleFile`, `OptionsPropEntry`, `VisualOptions`, `Ui`, `UiTarget`, `MuiVersion`, `ParseUiResult`. `FieldSpec` is the generator's intermediate representation; adding a field kind is a minor, removing or renaming one is a major.

**The generated code's relationship to the library.** Output of a given CLI version compiles against the library versions its header names. The *text* of the output is not stable across CLI releases (that is the point of regenerating), but the file layout of `--layout module` (`schema.ts`, `hooks.ts`, one file per field and section, the adapter file) and the generator header line that marks a file as generated are, because `--force` relies on them.

## Internal, and may change in a minor

- The hashed chunk files inside `dist/` and their import names; always import from the three entries.
- Anything under `src/core` or `src/react` that the entries do not re-export, including `arrayOpLog`, the id-store internals, `maps`, `mode` helpers beyond `shouldValidateOn`, and `env`.
- The row id format `useFieldArray` mints (`__zfa_...`). Use it as a React key, never parse it.
- The devtools panel's markup and styles.
- Console warning texts. They are for humans reading a terminal; tests that match them are tests of this repo, not of your app.
- The CLI's emitted code text, the exact wording of its stderr lines, and the `// TODO` comment texts, with the two exceptions stated above (module file layout and the generated-file header).
- The examples app, the playground's demo file sets, and the starter template. They track the current release and are rewritten freely.

## Deprecation policy

From 1.0, nothing on this page is removed in the release that deprecates it. A deprecation ships in a minor with a `@deprecated` tag naming the replacement, a CHANGELOG entry under `### Changed`, and a one-time dev-mode console warning where the surface is runtime (a CSS class or an emitted file layout gets a docs note instead). The removal lands no earlier than the next major, whose CHANGELOG entry lists every removal with the minor that announced it. CLI flags and config keys follow the same rule, and a removed flag keeps parsing for one major and prints the replacement.

Before 1.0 the same policy is followed in spirit: the `Changed` entries since 0.18 (array ops take array paths only, bound components type their `path` by value, `persistForm`'s apply mode respelled) each named the replacement and shipped in a minor, and the soak above is the commitment that there will be no more of them before 1.0.0.
