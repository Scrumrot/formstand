// The docs sidebar as plain data, shared by the VitePress config and by
// scripts/generate-llms-txt.mjs, which walks the same groups in the same
// order to write llms.txt. One list, so a page added here is indexed for
// agents without a second edit.
export const sidebar = {
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
        { text: "Messages & localization", link: "/documentation/messages" },
        { text: "Bound components", link: "/documentation/components" },
        { text: "Field arrays", link: "/documentation/field-arrays" },
        { text: "Multi-step forms", link: "/documentation/multi-step" },
        { text: "Form state & lifecycle", link: "/documentation/state" },
        { text: "Recipes", link: "/documentation/recipes" },
        { text: "Devtools", link: "/documentation/devtools" },
        { text: "Testing forms", link: "/documentation/testing" },
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
        { text: "Adding a UI kit", link: "/documentation/cli/adding-a-kit" },
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
        { text: "Public API & stability", link: "/documentation/api/stability" },
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
};
