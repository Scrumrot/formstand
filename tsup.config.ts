import { defineConfig } from "tsup";

export default defineConfig({
  // The devtools panel is its own entry so `formstand/devtools` resolves to
  // a chunk the main entry never pulls in: importing formstand must not drag
  // a debugging UI into a production bundle.
  entry: ["src/index.ts", "src/devtools/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: ["react", "zustand", "zod"],
});
