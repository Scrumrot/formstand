# Guide

Everything formstand does, in reading order. Start at [Getting started](./getting-started) if you're new — the rest can be read in any order.

## Fundamentals

- [Getting started](./getting-started) — install, first form, the mental model.
- [Typed paths](./typed-paths) — how `"users.0.email"` carries its value type everywhere.
- [Validation](./validation) — modes, field-scoped passes, async refines, `validateOnMount`.
- [Errors: schema & server](./errors) — the two error channels and why they can't clobber each other.

## Building forms

- [Bound components](./components) — the shipped `TextField`/`NumberField`/`SelectField`/`CheckboxField` and their a11y wiring.
- [Field arrays](./field-arrays) — stable row IDs, reorders, nested arrays, array-level errors.
- [Form state & lifecycle](./state) — flags, selectors, `createFormContext`, `createFormHooks`, snapshots.
- [Recipes](./recipes) — wizards, autosave, optimistic updates, dependent fields.

## Beyond the basics

- [Examples](./examples) — every playground demo with its full source.
- [Code generation](./code-generation) — `formstand-gen`: forms from a zod schema or a TS type, single-file or as a feature module.
- [Migrating from react-hook-form](./migrating-from-react-hook-form) — the full API mapping.
