// The playground's ChakraBridge must not restyle the shell: Chakra v3's
// default system injects an UNSCOPED preflight (`*` and body reset rules,
// ~48KB) into <head> while mounted. The bridge builds its own system with
// the preflight scoped under .chakra-scope (mirroring the shadcn tabs'
// scoping), so every reset selector that targets `*`/body/html must carry
// the scope class.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChakraBridge } from "../../examples/src/App";
import { ThemeModeProvider } from "../../examples/src/theme";

afterEach(cleanup);

// Top-level selector texts from every <style> in <head> (emotion runs
// un-"speedy" under test, so rule text is present as textContent). Nested
// blocks (media queries, keyframes) are stripped by only taking the text
// between a rule boundary and the next "{".
const headSelectors = (): readonly string[] =>
  [...document.head.querySelectorAll("style")]
    .map((style) => style.textContent ?? "")
    .flatMap((css) => [...css.matchAll(/(?:^|})([^{}]+)\{/g)])
    .map((match) => (match[1] ?? "").trim())
    .filter((selector) => selector !== "");

// A selector that RESETS untargeted elements: the universal selector, or a
// bare body/html type selector. CSS custom-property carriers like
// `:where(:root, :host)` are not resets and stay exempt.
const isResetSelector = (selector: string): boolean =>
  selector.includes("*") || /(^|[\s,>~+])(body|html)\b/.test(selector);

describe("ChakraBridge preflight scoping", () => {
  it("injects no unscoped */body reset rules while mounted", () => {
    render(
      <ThemeModeProvider mode="light">
        <ChakraBridge>
          <div>{"content"}</div>
        </ChakraBridge>
      </ThemeModeProvider>,
    );
    const resets = headSelectors().filter(isResetSelector);
    // The preflight must actually be present (an empty list would make the
    // scoping assertion vacuous)...
    expect(resets.length).toBeGreaterThan(0);
    // ...and every reset selector must be scoped under .chakra-scope.
    const unscoped = resets.filter(
      (selector) => !selector.includes(".chakra-scope"),
    );
    expect(unscoped).toEqual([]);
  });
});
