import { defineConfig } from "vitepress";
import pkg from "../../package.json" with { type: "json" };

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
    ["script", {}, legacyRedirect],
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
    sidebar: {
      "/documentation/": [
        {
          text: "Getting started",
          collapsed: false,
          items: [
            { text: "Introduction", link: "/documentation/" },
            { text: "Installation & first form", link: "/documentation/getting-started" },
            { text: "Typed paths", link: "/documentation/typed-paths" },
          ],
        },
        {
          text: "Guides",
          collapsed: false,
          items: [
            { text: "Validation", link: "/documentation/validation" },
            { text: "Errors: schema & server", link: "/documentation/errors" },
            { text: "Bound components", link: "/documentation/components" },
            { text: "Field arrays", link: "/documentation/field-arrays" },
            { text: "Form state & lifecycle", link: "/documentation/state" },
            { text: "Recipes", link: "/documentation/recipes" },
            { text: "Devtools", link: "/documentation/devtools" },
            { text: "SSR & Next.js", link: "/documentation/ssr" },
          ],
        },
        {
          text: "Code generation (CLI)",
          collapsed: false,
          items: [
            { text: "Why formstand-cli", link: "/documentation/cli/" },
            { text: "Quick start", link: "/documentation/cli/quick-start" },
            { text: "UI kits", link: "/documentation/cli/ui-kits" },
            { text: "Layouts & modes", link: "/documentation/cli/layouts" },
            { text: "Config & overrides", link: "/documentation/cli/config" },
            { text: "Custom templates", link: "/documentation/cli/templates" },
            { text: "Programmatic API", link: "/documentation/cli/programmatic" },
            { text: "Command reference", link: "/documentation/cli/reference" },
          ],
        },
        {
          text: "API reference",
          collapsed: true,
          items: [
            { text: "createForm & Form", link: "/documentation/api/" },
            { text: "Hooks", link: "/documentation/api/hooks" },
            { text: "Components & bindings", link: "/documentation/api/components" },
            { text: "Utilities & types", link: "/documentation/api/utilities" },
          ],
        },
        {
          text: "Resources",
          collapsed: true,
          items: [
            { text: "Examples", link: "/documentation/examples" },
            {
              text: "Migrating from react-hook-form",
              link: "/documentation/migrating-from-react-hook-form",
            },
          ],
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
