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
    dedupe: [
      "react",
      "react-dom",
      "zustand",
      "zod",
      "@mui/material",
      "@mui/icons-material",
      "@emotion/react",
      "@emotion/styled",
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
      reporter: ["text", "html"],
    },
  },
});
