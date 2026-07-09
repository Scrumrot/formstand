import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
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
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "formstand": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
    // The formstand alias points OUTSIDE this package (../src), so its bare
    // imports resolve upward into the repo root's node_modules — bundling a
    // second React whose hooks dispatcher is never set by the renderer
    // ("Cannot read properties of null (reading 'useRef')" on every tab),
    // plus second copies of zustand/zod. dedupe pins them all to this
    // package's copies. CI asserts the built bundle holds exactly one React
    // (scripts/check-single-react.mjs) — the vitest smoke test can't see
    // bundle-level duplication (the root vitest config has its own dedupe).
    dedupe: ["react", "react-dom", "zustand", "zod"],
  },
});
