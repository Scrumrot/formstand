import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Subpath first: a bare string alias rewrites the PREFIX, so the
      // more specific entry must win before "formstand" swallows it.
      "formstand/testing": fileURLToPath(
        new URL("./src/testing/index.ts", import.meta.url),
      ),
      // Lets tests render the examples app (which imports the published
      // name) against the library source.
      formstand: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
    // The examples files would otherwise pull React (and, for the MUI demos,
    // @mui/@emotion, installed at the root as devDependencies for exactly
    // this reason) from examples/node_modules. Two copies of React null the
    // hooks dispatcher; two copies of emotion split the theme context.
    // Keep this list in sync with scripts/check-lockfile-sync.mjs, which
    // fails CI when the two lockfiles resolve these to different versions.
    dedupe: [
      "react",
      "react-dom",
      "zustand",
      "zod",
      "@mui/material",
      "@mui/icons-material",
      "@mui/x-tree-view",
      "@emotion/react",
      "@emotion/styled",
      "radix-ui",
      "lucide-react",
      "@chakra-ui/react",
      "@mantine/core",
      "@mantine/hooks",
      "antd",
    ],
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // vitest 5 anchors coverage globs at the project root, so "src/**"
      // measures the library source only. Under vitest 4 the looser match
      // also folded in examples/src (hence the 2026-07 numbers below); the
      // playground is exercised by the smoke test and the e2e run, not by
      // these thresholds. cli/ stays excluded by intent: it has its own
      // suite gating its emitters, and one demo render exercising a
      // fraction of their branches would tank the global numbers here
      // without measuring anything cli's suite doesn't.
      exclude: ["cli/**"],
      reporter: ["text", "html", "json-summary"],
      // Set ~2-3 points below measured levels so coverage drift fails CI
      // without making every ordinary change a threshold fight. Library-only
      // under vitest 5 measures (2026-10-20) statements 97.41, branches
      // 91.57, functions 98.72, lines 98.3. The previous floors (82/74/74/82)
      // dated from 2026-07, when the glob also folded in examples/src; they
      // would have let a third of the branch coverage vanish unnoticed.
      thresholds: {
        statements: 95,
        branches: 89,
        functions: 96,
        lines: 96,
      },
    },
  },
});
