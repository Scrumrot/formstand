import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // The Pages workflow deploys this app under the docs site at
  // /formstand/examples/; local dev stays at the root.
  base: process.env.EXAMPLES_BASE ?? "/",
  // Conservative target: the library itself only needs ES2020-era features,
  // and the playground should run on older mobile WebKit rather than assume
  // the Vite default baseline.
  build: { target: "es2019" },
  plugins: [react()],
  resolve: {
    alias: {
      "formstand": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
});
