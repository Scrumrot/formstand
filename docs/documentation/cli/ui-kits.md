# UI kits

One flag, `--ui`, picks which component library the output binds to. The structure never changes: same fields, same sections, same array handling, same submit. Only the controls differ.

```bash
npx formstand-gen src/profileSchema.ts --ui mantine --out src/ProfileForm.tsx
```

| `--ui` | Target | What your app supplies |
| --- | --- | --- |
| `plain` (default) | formstand's own [bound components](../components) | nothing beyond formstand |
| `mui` | Material UI 5, 6, 7, or 9 | `@mui/material` and your theme setup |
| `shadcn` | [shadcn/ui](https://ui.shadcn.com/) conventions | components scaffolded via `npx shadcn add button input label checkbox select` |
| `chakra` | [Chakra UI](https://chakra-ui.com/) v3 | `@chakra-ui/react` v3, its `@emotion/react` peer, and a `ChakraProvider` at the root |
| `mantine` | [Mantine](https://mantine.dev/) v9 | `@mantine/core` v9, `@mantine/hooks`, the `@mantine/core/styles.css` import, and a `MantineProvider` |
| `antd` | [Ant Design](https://ant.design/) v6 | `antd` v6, no provider required |

Providers are never emitted. The generated file assumes your app already mounts whatever its kit needs, the same way it assumes your MUI theme exists.

## Pinning a major

`--ui mui` accepts a version suffix: `mui@5`, `mui@6`, `mui@7`, `mui@9`. Bare `mui` means the current major, 9. MUI has no version 8; 7.x jumped straight to 9.

The only difference in emitted output across MUI majors is the `TextField` slot-props API: `mui@5` emits the legacy `InputProps` and `InputLabelProps`, while 6 and later emit `slotProps.input` and `slotProps.inputLabel`.

The other kits have exactly one supported major each, so `chakra@3`, `mantine@9`, and `antd@6` are accepted as explicit spellings of `chakra`, `mantine`, and `antd`. Older majors fail with an explanation rather than emitting output that won't compile. formstand peers `react: ^19`, which rules out MUI 4 and Chakra 2 no matter what the generator does.

## What each backend actually emits

**`plain`** binds formstand's `TextField`, `NumberField`, `CheckboxField`, `SelectField`, and `DateField` directly. No adapter, no dependencies.

**`mui`** inlines a small adapter (`muiTextFieldProps`, `useMuiNumberFieldProps`, `muiSelectProps`, `muiSwitchProps`) that maps `UseFieldReturn` onto MUI props, sharing `parseNumberText` and `numberToInputText` with the library. Sections render as `Card` or `Accordion` with `sx` grids.

**`shadcn`** imports from the `@/components/ui/*` alias and speaks the Radix dialect: `onCheckedChange` and `onValueChange` callbacks, dropdown-close as the blur trigger, `aria-invalid` styling, and a message line. Section chrome uses Tailwind classes such as `md:grid-cols-2` and `bg-card`.

**`chakra`** uses v3's compound components: `Field.Root` with `invalid`, `Field.Label`, `Field.ErrorText`, `Input` for text, number, and date, `NativeSelect.Root` plus `NativeSelect.Field` for enums (a real `<select>`, so the adapter speaks plain DOM events), and the `Switch.Root` family for booleans.

**`mantine`** leans on Mantine's own `label`, `error`, and `description` props, so leaves are one-liners: `TextInput` for text, number, and date, `NativeSelect` for enums, `Switch` for booleans. Mantine's `NumberInput` is deliberately not used, because its `onChange` takes `(value: number | string)` rather than a DOM event.

**`antd`** binds antd's inputs as plain controlled components. antd's own `Form` and `Form.Item` are **never** emitted, because they are a second form-state store and formstand owns the state. `Input` covers text, number, and date; `Select` covers enums (antd ships no native `<select>`, so this is the one value-shaped adapter in the backend, with `id={path}` so formstand's focus helpers can reach it); `Checkbox` covers booleans, chosen over `Switch` because `Switch` has no `onBlur` at all. With no `Form.Item` there is no built-in error slot, so controls paint `status="error"` and render a `Typography.Text type="danger"` line.

All four stateful kit backends (mui, chakra, mantine, antd) share the same raw-text-preserving number binding, an inline `useNumberText` hook mirroring formstand's own [`useNumberInput`](../api/components#usenumberinput-field). Typing `85000.50` never gets reparsed into `8500050` halfway through.

## Compare them side by side

The playground renders the same Onboarding schema through four backends, with only `--ui` varying:

[Material UI](https://scrumrot.github.io/formstand/examples/#/gen-mui) · [Chakra](https://scrumrot.github.io/formstand/examples/#/gen-chakra) · [Mantine](https://scrumrot.github.io/formstand/examples/#/gen-mantine) · [Ant Design](https://scrumrot.github.io/formstand/examples/#/gen-antd)

## The version matrix

Every supported major is proven to typecheck the generated output before a release ships. `cli/matrix/` is an isolated workspace that installs `mui@5` through `mui@9`, Chakra 3, Mantine 9, and antd 6 side by side under npm aliases, generates fresh output for both layouts and all three section styles, and typechecks it against each package's real declarations under `strict` plus `exactOptionalPropertyTypes`.

It also runs literal-attribute probes for the props that would otherwise hide behind a JSX spread, since a spread makes TypeScript skip excess-property checking. The install-staleness gate derives from the job list, so adding a kit without installing its alias fails loudly instead of quietly typechecking against the repo's own copy.

```bash
cd cli/matrix && npm install   # once, and it is a chunky install
cd .. && npm run matrix
```

It is deliberately not part of `npm test`, since it needs its own `node_modules`. See the [CLI README](https://github.com/Scrumrot/formstand/tree/main/cli#the-ui-kit-version-matrix-pre-release-check) for the full job list.

Need a kit that isn't on this list? Write a [custom template](./templates).
