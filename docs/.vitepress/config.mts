import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitepress";
import pkg from "../../package.json" with { type: "json" };
import { sidebar } from "./sidebar.mjs";

// The guide and the API reference used to be two routes with two sidebars.
// They are one /documentation/ route now, with collapsible sidebar groups;
// legacyRedirect below keeps the old URLs alive.
const legacyRedirect = `
(function () {
  var p = location.pathname;
  var m = p.match(/^\\/formstand\\/(guide|api)\\/(.*)$/);
  if (!m) return;
  var page = m[2].replace(/\\.html$/, "").replace(/\\/$/, "");
  var moved = { "code-generation": "cli/" };
  var to = m[1] === "api"
    ? "/formstand/documentation/api/" + (page === "index" ? "" : page)
    : "/formstand/documentation/" + (page === "index" || page === "" ? "" : (moved[page] || page));
  location.replace(to + location.hash);
})();
`;

export default defineConfig({
  title: "formstand",
  description: "Zod-schema-first form state for React 19, backed by zustand",
  // Deployed to GitHub Pages under /formstand/. Drop this (and the favicon
  // prefix) if the site ever moves to a custom domain.
  base: "/formstand/",
  head: [
    ["link", { rel: "icon", href: "/formstand/favicon.svg" }],
    ["meta", { property: "og:title", content: "formstand" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Zod-schema-first form state for React 19, backed by zustand",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    // Absolute URLs on purpose: scrapers resolve og tags without a base.
    [
      "meta",
      {
        property: "og:image",
        content: "https://scrumrot.github.io/formstand/og.png",
      },
    ],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    [
      "meta",
      {
        name: "twitter:image",
        content: "https://scrumrot.github.io/formstand/og.png",
      },
    ],
    ["script", {}, legacyRedirect],
  ],
  lastUpdated: true,
  // Every documentation page is also published as plain markdown at the
  // same URL with a .md suffix (scripts/generate-llms-txt.mjs writes the
  // copies after the build). The llms.txt convention discovers them through
  // these two link relations: alternate/text-markdown for the page's own
  // copy, describedby for the index that covers it.
  transformHead({ pageData }) {
    const rel = pageData.relativePath;
    if (!rel.startsWith("documentation/")) return [];
    return [
      ["link", { rel: "alternate", type: "text/markdown", href: `/formstand/${rel}` }],
      ["link", { rel: "describedby", href: "/formstand/llms.txt" }],
    ];
  },
  vite: {
    plugins: [
      {
        // The examples page transcludes playground demo sources
        // (`<<< ../../examples/src/...`). Those files carry two lines of
        // playground harness (the useDemoForm import and call) that the
        // playground's own code panel strips so copied code compiles;
        // the docs listings must match. VitePress resolves `<<<` outside
        // the markdown-it pipeline, so the reliable seam is the RAW .md
        // source: this pre-transform replaces each examples include with
        // a plain fenced block of the harness-stripped file, and the
        // ordinary highlighter takes it from there.
        name: "formstand:strip-demo-harness",
        enforce: "pre" as const,
        transform(code: string, id: string) {
          const file = id.replace(/\\/g, "/").split("?")[0] ?? "";
          if (!file.endsWith(".md") || !code.includes("<<< ../../examples/src/")) {
            return undefined;
          }
          const dir = path.dirname(file);
          return code.replace(
            /^<<< (\.\.\/\.\.\/examples\/src\/\S+)$/gm,
            (_line, rel: string) => {
              const target = path.resolve(dir, rel);
              const source = fs
                .readFileSync(target, "utf8")
                .split("\n")
                .filter((line) => !line.includes("useDemoForm"))
                .join("\n")
                .trimEnd();
              const lang = target.endsWith(".tsx") ? "tsx" : "ts";
              return ["```" + lang, source, "```"].join("\n");
            },
          );
        },
      },
    ],
  },
  sitemap: { hostname: "https://scrumrot.github.io/formstand/" },
  themeConfig: {
    logo: { src: "/logo.svg", alt: "formstand" },
    editLink: {
      pattern: "https://github.com/Scrumrot/formstand/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    nav: [
      { text: "Documentation", link: "/documentation/", activeMatch: "/documentation/" },
      { text: "CLI", link: "/documentation/cli/", activeMatch: "/documentation/cli/" },
      {
        text: "Playground",
        link: "https://scrumrot.github.io/formstand/examples/",
      },
      {
        text: `v${pkg.version}`,
        items: [
          {
            text: "Changelog",
            link: "https://github.com/Scrumrot/formstand/blob/main/CHANGELOG.md",
          },
          { text: "formstand on npm", link: "https://www.npmjs.com/package/formstand" },
          {
            text: "formstand-cli on npm",
            link: "https://www.npmjs.com/package/formstand-cli",
          },
          { text: "zod", link: "https://zod.dev" },
          { text: "zustand", link: "https://zustand.docs.pmnd.rs" },
        ],
      },
    ],
    sidebar,
    socialLinks: [
      { icon: "github", link: "https://github.com/Scrumrot/formstand" },
    ],
    search: { provider: "local" },
    footer: {
      message:
        'Built on <a href="https://zod.dev" target="_blank" rel="noreferrer">zod</a> and <a href="https://zustand.docs.pmnd.rs" target="_blank" rel="noreferrer">zustand</a>. Released under the MIT License.',
    },
  },
});
