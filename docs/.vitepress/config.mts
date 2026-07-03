import { defineConfig } from "vitepress";

export default defineConfig({
  title: "formstand",
  description: "Zod-schema-first form state for React 19, backed by zustand",
  head: [["link", { rel: "icon", href: "/favicon.svg" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/" },
      { text: "Changelog", link: "https://github.com/Scrumrot/formstand/blob/main/CHANGELOG.md" },
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
      message: "Released under the MIT License.",
    },
  },
});
