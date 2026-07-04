import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Lets tests render the examples app (which imports the published
      // name) against the library source.
      formstand: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
    // The examples files would otherwise pull React from examples/
    // node_modules — two React copies null the hooks dispatcher.
    dedupe: ["react", "react-dom", "zustand", "zod"],
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
