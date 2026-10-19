import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/.tmp/**", "node_modules/**"],
    // The typecheck tests build real ts.createPrograms against the library
    // source (2 to 5 s each alone). Under the suite's parallelism they
    // contend for CPU and memory, and on a many-core machine a case that
    // takes 5 s alone has overrun 30 s while the other typecheck files ran
    // alongside. The timeout exists to catch a hang, not to budget compile
    // time, so it sits well above the slowest honest case.
    testTimeout: 120_000,
  },
});
