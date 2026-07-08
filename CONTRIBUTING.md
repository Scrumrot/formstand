# Contributing to formstand

## Setup: three npm roots

This repo contains **three independent npm roots** — the library (`.`), the
examples app (`examples/`), and the code generator (`cli/`) — and each needs
its own install. **The root test suite renders the examples app, so the
examples install is required before `npm test` will pass**, not optional:

```bash
npm ci                 # library (root)
npm ci --prefix examples   # required by the root test suite
npm ci --prefix cli        # only needed when working on the CLI
```

## Commands

| Where      | Command                  | What it does                          |
| ---------- | ------------------------ | ------------------------------------- |
| root       | `npm run typecheck`      | `tsc --noEmit` over src/tests/examples |
| root       | `npm run lint`           | ESLint                                |
| root       | `npm test`               | Vitest (unit + examples smoke tests)  |
| root       | `npm run test:coverage`  | Tests with coverage thresholds        |
| root       | `npx vitest bench --run` | Benchmarks (see `bench/README.md`)    |
| root       | `npm run docs:dev`       | VitePress docs, live                  |
| root       | `npm run docs:build`     | VitePress docs, production build      |
| `examples` | `npm run dev`            | Vite dev server for the playground    |
| `examples` | `npm run build`          | Typecheck + production build          |
| `cli`      | `npm run typecheck`      | `tsc --noEmit`                        |
| `cli`      | `npm test`               | Vitest                                |
| `cli`      | `npm run build`          | tsup                                  |

## Why this is deliberately not an npm workspace

The examples app deploys as a standalone GitHub Pages app with its own
lockfile and dependency set, and the root `vitest.config.ts` `resolve.dedupe`
block exists precisely to unify React/emotion across the two `node_modules`
trees when tests render the examples app against the library source.
Converting to workspaces would hoist dependencies and silently change those
assumptions — don't.

## Code style

`CLAUDE.md` at the repo root is the source of truth: functional/declarative
style, no mutation (`const` only, spreads over property writes), no classes,
discriminated unions for variants.

## Pull requests

- Add or update tests for any behavior change.
- All gates must be green: typecheck, lint, tests (with coverage thresholds),
  build, and docs build — the same steps CI runs.
