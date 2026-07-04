import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/.tmp/**", "node_modules/**"],
    // The typecheck tests build real ts.createPrograms against the library
    // source — slower on CI runners than the 5s default.
    testTimeout: 30_000,
  },
});
