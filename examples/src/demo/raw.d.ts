declare module "*?raw" {
  const src: string;
  export default src;
}

// The slice of Vite's import.meta.glob the demo-sources module uses (raw,
// eager, default import -> a path-to-source map). Declared here instead of
// pulling in vite/client so the root typecheck and vitest compile this
// file without Vite's types; vitest's vite-node implements glob natively.
interface ImportMeta {
  glob(
    pattern: string,
    options: Readonly<{ query: "?raw"; import: "default"; eager: true }>,
  ): Readonly<Record<string, string>>;
}
