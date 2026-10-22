# Contributing to formstand

## Setup: three npm roots

This repo contains **three independent npm roots**: the library (`.`), the
examples app (`examples/`), and the code generator (`cli/`). Each needs
its own install. **The root test suite renders the examples app, so the
examples install is required before `npm test` will pass**, not optional:

```bash
npm ci                 # library (root)
npm ci --prefix examples   # required by the root test suite
npm ci --prefix cli        # only needed when working on the CLI
```

**Node 22.22.2 or newer** for the root test suite (`.nvmrc` says `22`; CI
runs the current 22.x). jsdom 30.1 declares that floor in its `engines`, and
the undici it pulls binds Node's zstd decompressor at import, an API that
arrived in Node 22.15. On an older 22.x every jsdom test file fails to start
its worker with `Cannot read properties of undefined (reading 'bind')` before
a single test runs. The published packages themselves keep their `>=18`
engines range; this is a development requirement only.

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
assumptions, so don't.

## Code style

`CLAUDE.md` at the repo root is the source of truth: functional/declarative
style, no mutation (`const` only, spreads over property writes), no classes,
discriminated unions for variants.

## Pull requests

- Add or update tests for any behavior change.
- All gates must be green: typecheck, lint, tests (with coverage thresholds),
  build, and docs build, the same steps CI runs.
- Bundle sizes are budgeted. After `npm run build` and `npm run build` in
  `examples/`, `node scripts/check-bundle-size.mjs` compares the gzip size
  of the library's three entries and the playground's main chunk and
  stylesheet against budgets set a few percent above measured. A change
  that deliberately grows an artifact raises its budget in that script, in
  the same PR, with the reason in the commit message.
- Touching docs or a README? Run `npm run docs:build` then
  `node scripts/check-doc-links.mjs`. It resolves every internal link and
  every `#anchor` against the ids the build just rendered, across `docs/`
  and both READMEs. VitePress catches dead `.md` links inside `docs/` on its
  own, but not anchors, and not the READMEs at all.
