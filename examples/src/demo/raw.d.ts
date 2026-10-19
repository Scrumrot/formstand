declare module "*?raw" {
  const src: string;
  export default src;
}

// The slice of Vite's import.meta.glob the demo-sources module uses (raw,
// NON-eager, default import -> a path-to-loader map). Declared here instead
// of pulling in vite/client so the root typecheck and vitest compile this
// file without Vite's types; vitest's vite-node implements glob natively.
// Non-eager on purpose: each matched file becomes its own chunk, fetched
// when the View code panel first needs it, instead of 436 kB of source text
// riding in the main bundle.
interface ImportMeta {
  glob(
    pattern: string,
    options: Readonly<{ query: "?raw"; import: "default" }>,
  ): Readonly<Record<string, () => Promise<string>>>;
  // The slice of import.meta.env the shell reads (vitest sets VITEST so
  // effects can skip network calls under test). Optional: absent outside
  // Vite/vitest.
  readonly env?: Readonly<Record<string, string | undefined>>;
}
// TypeScript 7 (TS2882) requires side-effect imports like "./styles.css"
// to resolve to a module declaration.
declare module "*.css";
