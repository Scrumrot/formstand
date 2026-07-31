# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

### Functional / Declarative

- Prefer expressions over statements; describe **what** to compute, not **how** to iterate
- Compose small, pure functions; data-in → data-out
- Use `map`, `filter`, `reduce`, `flatMap`, `Object.fromEntries` over loops
- Derive values instead of storing intermediate state
- Avoid side effects in core logic; keep them at the edges (I/O, timers)
- Expected failure is a **return value**, not an exception: a discriminated union (`{ kind: "valid" | "invalid" | "pending" }`) so callers `switch` instead of `try`. Throwing is reserved for operator error at a process boundary (missing config file, refusing to clobber output without `--force`)
- Named exports only, no default exports (repo-wide, not just components)

### No Mutation

- `const` for all variables; no `let` or `var`. If you need mutation, refactor into pure transformations
- For arrays: use `concat`, `slice`, `[...arr].sort(...)` — not `push/pop/splice/sort` in place (exception: inside `reduce` with a new accumulator array)
- For objects: use spreads `{ ...obj, k: v }` — not direct property writes
- Prefer `readonly` properties, `Readonly<T>`, and `readonly` arrays

### No Classes

- No `class`, `new`, or `this`
- Use modules of pure functions and plain data
- Model variants with **discriminated unions** and handle via `switch` on `kind`

### React Components

- Function components with hooks only
- File order: imports → types → custom hooks → component
- Avoid early returns in components; use conditional rendering
- Extract non-rendering logic into custom hooks

### TypeScript

- Props types: `export type ComponentNameProps = Readonly<{...}>`
- Use discriminated unions for variants
- Leverage the type system to catch errors early and document intent
- Make omissions compile errors: `switch` on `kind` with **no `default` arm**, and per-variant lookups as exhaustive `Readonly<Record<K, V>>` maps. Adding a variant should break the build, not fall through silently

### Comments

- Comment the **why**, not the what: the constraint, the rejected alternative, the failure it prevents
- Comment density here is high on purpose; a bare `// increment counter` is worse than no comment

### Component Naming

Naming rules for components you **create**. This is prescriptive, not a
description of the repo: most of these shapes don't exist here yet, because
formstand is a library rather than an app. Their absence is expected and is
**not** a reason to treat the rules as stale or to delete them. Follow the
pattern whenever one of these is added.

- `{Entity}ListCards` for card and grid views
- `{Entity}ListTable` for table views with bulk operations
- `{Parent}{Children}List` for contextual lists inside detail pages
- `{Entity}Form` for create and edit forms (Dialog-based)
- `{Entity}Details` for detail views with structured sections
- `{Entity}CreateButton` / `{Entity}EditButton` for action triggers

