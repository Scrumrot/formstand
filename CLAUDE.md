# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

### Functional / Declarative

- Prefer expressions over statements; describe **what** to compute, not **how** to iterate
- Compose small, pure functions; data-in → data-out
- Use `map`, `filter`, `reduce`, `flatMap`, `Object.fromEntries` over loops
- Derive values instead of storing intermediate state
- Avoid side effects in core logic; keep them at the edges (I/O, timers)

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
- Named exports, not default exports
- File order: imports → types → custom hooks → component
- Avoid early returns in components; use conditional rendering
- Extract non-rendering logic into custom hooks

### TypeScript

- Strict mode always enabled
- Props types: `export type ComponentNameProps = Readonly<{...}>`
- Use discriminated unions for variants
- Leverage the type system to catch errors early and document intent

### Component Naming

- `{Entity}ListCards` — Card/grid views
- `{Entity}ListTable` — Table views with bulk operations
- `{Parent}{Children}List` — Contextual lists within detail pages
- `{Entity}Form` — Create/edit forms (Dialog-based)
- `{Entity}Details` — Detail views with structured sections
- `{Entity}CreateButton` / `{Entity}EditButton` — Action triggers

### Planning & Progress Tracking

- When in planning mode make sure to write out a detailed plan for how you will approach the problem, including any necessary steps, considerations, and potential challenges. This will help ensure that you have a clear roadmap for solving the problem and can identify any potential issues before you start coding.
- Consider context window size when planning, and break down the problem into smaller chunks if necessary to fit within the context window. This will help you stay organized and focused as you work through the problem.
- After each step, review your progress and adjust your plan as needed. This will help you stay on track and ensure that you are making steady progress towards your goal.
- Record steps as being done, in progress, or planned, and use this information to track your progress and identify any areas where you may need to adjust your approach. This will help you stay organized and focused as you work through the problem.
- make sure you are using patterns and best practices for the current version of the libraries and frameworks being used in the project. This will help ensure that your code is maintainable, scalable, and follows industry standards.
