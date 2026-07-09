import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Lets tests render the examples app (which imports the published
      // name) against the library source.
      formstand: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
    // The examples files would otherwise pull React (and, for the MUI demos,
    // @mui/@emotion — installed at the root as devDependencies for exactly
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
      "@emotion/react",
      "@emotion/styled",
      "radix-ui",
      "lucide-react",
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
      reporter: ["text", "html", "json-summary"],
      // Set ~2-3 points below measured levels (2026-07: statements 81.26,
      // branches 79.07, functions 70.73, lines 81.34) so coverage drift
      // fails CI without making every ordinary change a threshold fight.
      thresholds: {
        statements: 78,
        branches: 76,
        functions: 68,
        lines: 78,
      },
    },
  },
});
