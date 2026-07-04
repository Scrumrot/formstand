import { defineConfig } from "tsup";

// The shebang lives literally at the top of src/cli.ts (esbuild preserves a
// source hashbang), so no banner option is needed — a banner would land on
// every entry, including the library build.
export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: {
    entry: { index: "src/index.ts" },
  },
  target: "node18",
  platform: "node",
  sourcemap: false,
  clean: true,
});
