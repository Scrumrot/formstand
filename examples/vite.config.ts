import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // The Pages workflow deploys this app under the docs site at
  // /formstand/examples/; local dev stays at the root.
  base: process.env.EXAMPLES_BASE ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "formstand": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
});
