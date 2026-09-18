// formstand's docs theme: the default VitePress theme with the brand layer
// (brass/ink palette, hero and feature treatments, restrained motion) in
// custom.css — no layout overrides, so VitePress upgrades stay painless.
// One global component: the StackBlitz opener the examples page drops into
// its per-demo details blocks (it reuses the playground's seed builder).
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import StackBlitzLink from "./StackBlitzLink.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("StackBlitzLink", StackBlitzLink);
  },
} satisfies Theme;
