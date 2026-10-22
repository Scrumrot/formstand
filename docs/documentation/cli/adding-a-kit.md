# Adding a UI kit backend

How a new component library becomes a `--ui` target. This is the contributor's page: it walks one kit from the parser to the version matrix, naming every file a backend touches, so a pull request for a seventh kit arrives whole instead of being discovered in review. If you only need your own design system in your own repo, you want [custom templates](./templates) instead: a template overrides the per-kind controls and inherits everything else, with no fork and no release.

The six shipped backends are the reference. Ant Design (antd 6) is the most recent and the smallest, so it is the one to read alongside this page; every path below names its antd counterpart.

## What a backend is

The generator walks one intermediate representation (`FieldSpec`, built by `fromZod`, `fromType` or `fromJsonSchema`) and emits a component through a `Backend`: a record of pure functions in `cli/src/codegen.ts` that answer "what does this kit print here" at each point of the shared walk. The walk owns the structure (sections, arrays, discriminated unions, the submit and `--live` scaffolds, per-field spans); the backend owns the controls, the imports, the adapter helpers, and the chrome around sections and array rows. Two layouts consume it: the single-file emitter (`emitForm(backend, options)`) and the feature-module layout in `cli/src/moduleLayout.ts`, which does not take a `Backend` object but switches on the same kit name at each site where the kit's idiom differs.

The `Backend` type (search `type Backend = Readonly<{` in codegen.ts) has these members:

| Member | What it answers | antd's answer |
| --- | --- | --- |
| `header` | the imports at the top of the file, from the kinds the schema uses | one `from "antd"` import naming only the controls the schema's kinds need |
| `preamble` | module-level sections between the array declarations and the component: the adapter helpers and any Bound wrappers | `antdAdapterSection(usage)`: `antdTextInputProps`, `useAntdNumberInputProps`, `antdSelectProps`, `antdCheckboxProps`, the `fieldError` helper |
| `leaf` | one bound control for a scalar field, or the `// TODO` fallback for a kind the kit cannot bind | a `Flex` column of label, `Input`/`Select`/`Checkbox`, and the explicit error line |
| `variantLeaf` | the same control from an already-bound field variable, for the discriminant select and each variant field of a union | the same markup over a hoisted `useField`/`useVariantField` result |
| `numberPropsHook` | the emitted number-binding hook name, for kits whose number binding holds raw-text state | `useAntdNumberInputProps` |
| `gridChild` | kit-native grid cells when the kit lays sections out with a real layout component, only at `--columns` above 1 | `<Col xs={24} sm={N}>` per field, `<Col span={24}>` for a full row |
| `unionCellShell` | vertical rhythm for a union riding a grid cell, for kits whose leaves do not carry their own wrapper | undefined (antd leaves are each a `Flex`) |
| `spanCell` | the cell for a config `fields` span (`span: "full"` or a column count) | an antd `Col` with the span's `sm` value, through `spanCellFor("antd", ...)` |
| `objectSection` | the wrapper around a nested object's fields, per `--sections` style | `Typography.Title` plus `Row`/`Col` (panel), `Collapse` with the items API (collapsible), a vertical `Flex` (flat) |
| `arraySection` | the wrapper around a field array's mapped rows and its add button | the same chrome around rows with `Button` controls |
| `bodyLevel` | the indentation level of the top-level field list | 4 |
| `formShell` | the form element in pieces (`open`, `afterSubmit`, `submitButton`, `close`) so the submit and `--live` shapes compose from one source | a `<form>` whose submit control is an antd `Button htmlType="submit"` |

The comments on the type in codegen.ts are the authoritative contract, including which members are optional and why. Read them before the table above.

## The checklist

Each item names the file, the antd counterpart to copy, and the test that pins it.

### 1. The target

`cli/src/uiTarget.ts`. Add the kit to the `UiTarget` union (`{ kit: "yourkit" }`, with a `version` field only if you intend to support several majors the way `mui` does), to the `Ui` spelling union (`"yourkit"` and the explicit `"yourkit@N"` form), and to `UI_KITS` in presentation order. `UI_CHOICES` and the `--help` text derive from `UI_KITS`, and the config file's `ui` key is typed by the `Ui` union, so nothing else lists kits by hand. Add a `case` to `parseUiTarget`: the single-major kits share `singleMajorKit`, whose rules return the exact, kit-specific sentence an unsupported major gets (why that major cannot work, and the one supported spelling). The messages are pinned verbatim by `cli/tests/uiTarget.test.ts`; write the rationale once, there.

One decision belongs here, not in code review later: which majors the backend will claim. The existing kits claim exactly the majors the matrix (step 7) typechecks against, and refuse the others with the reason. formstand peers `react ^19`, which already rules out any major that predates React 19.

### 2. The adapter helpers

`cli/src/codegen.ts`, in a new section between the last kit backend and the custom template backend (the file has a banner comment per section; add one). Start with the adapter section, the module-level helpers the emitted file carries so it has no runtime dependency on formstand-cli: a text binding, a number binding, a select binding, a checkbox binding, and the error helper, each taking a `useField` result and returning the kit's props. Copy `antdAdapterSection(usage, exp)`; the `usage` argument is the `KindUsage` of the schema, so helpers for kinds the schema never uses are not emitted (the "leaf-free module omits the adapter" test in `moduleLayout.test.ts` pins this). Name the bindings through `kitScalarBinding(ui, kind)`, which produces `${ui}TextInputProps`, `use${Ui}NumberInputProps` and `${ui}DateInputProps` for every kit, so the module layout and the single-file emitter agree on names without restating them.

Two decisions the existing adapters already made, and a new one should follow: formstand owns the state, so the kit's own form components (`Form`, `Form.Item`, `FormControl` wrappers that manage value) are never used; and the error line is always explicit markup fed by `fieldError`, so a screen reader hears it even in kits whose controls have no error slot.

### 3. The backend factory and the emitter

Same section. `yourkitBackend(visual, scaffold): Backend` builds the record from the table above (copy `antdBackend`), and `emitYourkitForm(options)` is one line: `emitForm(yourkitBackend(options.visual ?? DEFAULT_VISUAL, scaffoldOf(options)), options)`. Export the emitter from `cli/src/codegen-api.ts` (the browser-safe programmatic surface the playground's Schema builder also calls) and add the dispatch arm in `cli/src/cli.ts` (`case "yourkit": return emitYourkitForm(options)`).

Two shared helpers switch on the kit name and need an arm: `spanCellFor` (the `fields` span cell in the kit's grid dialect) and the set of kinds whose bindings are kit adapters rather than Bound components (search `new Set(["string", "number", "date", "enum"])`). TypeScript's exhaustiveness makes both missing arms compile errors once the union has the new member, which is the point of the discriminated union: the compiler produces the rest of this checklist for codegen.ts.

### 4. The module layout

`cli/src/moduleLayout.ts` switches on `ModuleUi` (`"plain" | KitUi`) at every site where a kit's idiom differs. Add the kit to `KitUi` in codegen.ts and the compiler lists the sites; for antd there are fourteen. They cover: the field file's imports for a scalar leaf, for an autocomplete override and for a textarea override; the leaf markup; the number binding name; the autocomplete control; the union variant leaf; the grid cell at `--columns` above 1; the section shells per `--sections` style; the array shell; the form shell; the adapter file's content (`yourkitAdapterSection(usage, "export ")`, the same helpers as step 2 with `export` prepended); and the root component's chrome. Each arm is small, and each has a sibling arm to copy.

### 5. Tests

`cli/tests/`. Three suites take a kit arm each:

- `uiTarget.test.ts`: the accepted spellings, the explicit `@N` form, and the exact refusal sentence for each unsupported major.
- `typecheck.test.ts` and `moduleLayout.test.ts`: generated output for the kitchen-sink fixtures must typecheck under `strict` and `exactOptionalPropertyTypes`, with no kit installed in `cli/`. That works through a structural stub: `cli/tests/stubs/yourkit.d.ts` declares exactly the controls the backend emits with their props typed to the adapter's output, mapped in through a `yourkitStubPaths` entry in `cli/tests/helpers.ts`. Read `antd.d.ts`: it is deliberately narrow and encodes the two typing decisions the backend makes (a value-shaped `Select.onChange`, a kit-specific checkbox event), so a wrong-shaped adapter fails here rather than in a user's project. The stub is the test's contract with the backend; the real declarations are the matrix's job.
- The behaviour suites (`descriptions`, `overrides`, `spans`, `nestedUnions`, `degradedLeaves`, `scaffoldModes`) are parameterized over kits where a kit's slot differs: the helper-text slot, the autocomplete and textarea overrides, the span cell, the union rendering, the degraded leaf, `--live` and `--form-prop`. Add the kit wherever those suites enumerate `KitUi` members.

### 6. The playground

The deployed playground renders each kit's output from the Onboarding schema, so the tab is the demo and the regression test at once.

- `examples/package.json`: the kit as a dependency, and the same package in the dedupe lists in `vitest.config.ts` and `scripts/check-lockfile-sync.mjs` (the root and examples lockfiles must resolve it to one version; CI fails when they drift).
- `scripts/generate-cli-demos.mjs`: a `kitDemo("yourkit", "YourkitOnboardingForm")` entry. Run it after `npm --prefix cli run build`; CI regenerates and fails on drift, so nothing under `examples/src/generated/` is edited by hand.
- A bridge in `examples/src/demo/YourkitBridge.tsx` if the kit needs a provider (Chakra and Mantine do, antd does not), exporting a `YourkitOnboardingDemo` that wraps the generated form, so the kit loads with its tab only.
- `examples/src/App.tsx`: a `genYourkit` entry in `DEMOS`, `GROUP_OF` ("Generated") and `BLURBS`, and the matching file list in `examples/src/demo/demoSources.ts`. All three records are exhaustive over the tab key, so a missing one is a compile error.
- `tests/react/generated-kits.test.tsx`: the render smoke over the generated demo (number typing, array errors, focus), wrapped in the bridge exactly as the playground does.

### 7. The version matrix

`cli/matrix/`. This is what lets the docs say "typechecked against the real declarations before a release ships". Add the package under an npm alias in `cli/matrix/package.json` (`"yourkit6": "npm:yourkit@^6.0.0"`, one alias per supported major), and a job in `run.mjs`: `label`, `alias`, `kitPaths` mapping the bare specifier onto the alias, `emitSingle` (the emitter from step 3), `moduleUi`, and a `probe`. The probe is a generated `Probe.tsx` that restates every prop the adapter spreads as a literal attribute, because a JSX spread bypasses TypeScript's excess-property check and a wrong prop surface would otherwise typecheck. Copy `ANTD_PROBE` and its comment. The stale-install gate derives from the job list, so a job whose alias is not installed fails loudly instead of typechecking against the repo root's copy of the package.

```bash
cd cli/matrix && npm install
cd .. && npm run matrix
```

### 8. Docs and changelog

- `docs/documentation/cli/ui-kits.md`: the row in the target table (what the user's app must supply, providers included), a paragraph under "What each backend actually emits", and the kit in the matrix paragraph. The same table lives in `cli/README.md`.
- `docs/documentation/cli/index.md` and the root `README.md` name the kits in prose; add yours.
- `CHANGELOG.md`, `## formstand-cli Unreleased`, `### Added`: one entry naming the kit, the major(s) it targets, and the refusal rule for the others.

## What to decide before writing code

- **Which majors, and why not the others.** The refusal sentences in `parseUiTarget` are user-facing and pinned by tests; they should name the API the backend emits that the older major lacks, or the React 19 peer.
- **Grid dialect.** Kits with a real layout component (MUI `Grid`, antd `Row`/`Col`, Mantine `Grid.Col`) define `gridChild` and `spanCell` cells; kits whose children are grid items by placement (CSS grid) leave `gridChild` undefined and wrap the leaf in the span cell instead. The two shapes exist because both idioms are real; pick the one the kit's own docs use for form layout.
- **Number input.** Every kit except shadcn binds numbers through a `useState`-backed hook that preserves the raw text while typing (`useYourkitNumberInputProps`), so "1." and "-" survive a keystroke. Follow it unless the kit ships a number control that already does.
- **Where the error line lives.** Explicit markup fed by `fieldError`, every kit, even when the kit has an error slot: the slot is usually tied to the kit's own form state, which formstand replaces.

## Running the gates

From `cli/`: `npm run typecheck`, `npm test` (535 tests at the time of writing; several suites typecheck generated output under 32-core parallelism and have a 120 s timeout for that reason), then `npm run matrix` with the matrix installed. From the repo root, after `npm --prefix cli run build`: `node scripts/generate-cli-demos.mjs`, then the root `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` in `examples/` followed by `node scripts/check-single-react.mjs` and `node scripts/check-bundle-size.mjs`. CI runs the same steps; a kit that passes them locally lands.
