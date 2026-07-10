import { defineConfig } from "vitepress";

export default defineConfig({
  title: "formstand",
  description: "Zod-schema-first form state for React 19, backed by zustand",
  // Deployed to GitHub Pages under /formstand/ — drop this (and the favicon
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
  ],
  lastUpdated: true,
  sitemap: { hostname: "https://scrumrot.github.io/formstand/" },
  themeConfig: {
    logo: { src: "/logo.svg", alt: "formstand" },
    editLink: {
      pattern: "https://github.com/Scrumrot/formstand/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/" },
      {
        text: "Playground",
        link: "https://scrumrot.github.io/formstand/examples/",
      },
      { text: "Changelog", link: "https://github.com/Scrumrot/formstand/blob/main/CHANGELOG.md" },
      {
        text: "Built on",
        items: [
          { text: "zod", link: "https://zod.dev" },
          { text: "zustand", link: "https://zustand.docs.pmnd.rs" },
        ],
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Typed paths", link: "/guide/typed-paths" },
            { text: "Validation", link: "/guide/validation" },
            { text: "Errors: schema & server", link: "/guide/errors" },
            { text: "Bound components", link: "/guide/components" },
            { text: "Field arrays", link: "/guide/field-arrays" },
            { text: "Form state & lifecycle", link: "/guide/state" },
            { text: "Recipes", link: "/guide/recipes" },
            { text: "SSR & Next.js", link: "/guide/ssr" },
            {
              text: "Migrating from react-hook-form",
              link: "/guide/migrating-from-react-hook-form",
            },
            { text: "Code generation", link: "/guide/code-generation" },
            { text: "Examples", link: "/guide/examples" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API reference",
          items: [{ text: "Overview", link: "/api/" }],
        },
      ],
    },
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
