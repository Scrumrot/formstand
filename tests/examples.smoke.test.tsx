import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../examples/src/App";
import { DEMO_SOURCES } from "../examples/src/demo/demoSources";

afterEach(cleanup);

const statePres = (card: HTMLElement): readonly HTMLElement[] =>
  Array.from(card.querySelectorAll<HTMLElement>("pre.state-dump"));

const TAB_COUNT = Object.keys(DEMO_SOURCES).length;

// Demos with no registered form instance: the CLI's single-file layout
// creates its form inside the component (useForm) and exports nothing to
// hand useDemoForm, so the shell's View state button stays disabled there
// — asserted as such below instead of exempted silently.
const NO_REGISTERED_FORM: ReadonlySet<string> = new Set([
  "Gen: deep nesting",
  "Gen: Chakra UI",
  "Gen: Mantine",
  "Gen: Ant Design",
]);

// The sidebar is a tree view: demo leaves carry the nav-tab class and switch
// tabs when their content row is clicked.
const renderAppAndGetTabs = (): readonly HTMLElement[] => {
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  const tabs = Array.from(
    document.querySelectorAll<HTMLElement>(".nav-tab .MuiTreeItem-content"),
  );
  expect(tabs.length).toBe(TAB_COUNT);
  return tabs;
};

// The deployed playground is the library's public face — render every tab
// for real so a runtime crash (e.g. an uncached-selector infinite loop,
// React error #185) fails CI instead of shipping a blank page. One test per
// tab (rather than one walk) so a failure names its demo and each render
// gets its own timeout — the single-walk version outgrew any fixed ceiling
// as demos accumulated.
describe("examples playground smoke test", () => {
  it.each(Array.from({ length: TAB_COUNT }, (_, index) => index))(
    "tab %i renders content and has working View code / View state toggles",
    (index) => {
      const tabs = renderAppAndGetTabs();
      const tab = tabs[index];
      expect(tab).toBeDefined();
      if (tab === undefined) return;

      fireEvent.click(tab);
      const card = document.querySelector<HTMLElement>(".card");
      expect(card).not.toBeNull();
      const scope = within(card as HTMLElement);

      // The demo itself rendered DOM — asserted on the shell's demo-body
      // wrapper, not the card, so the shell's own buttons can't satisfy it.
      const body = (card as HTMLElement).querySelector(".demo-body");
      expect(
        body?.childNodes.length ?? 0,
        `demo content on tab "${tab.textContent}"`,
      ).toBeGreaterThan(0);

      // View code: the shell shows the tab's source (the default file for
      // multi-file demos), which always contains a form-creation call —
      // with the playground-harness useDemoForm lines stripped so copied
      // code compiles outside the playground.
      const codeButton = scope.getByRole("button", { name: "View code" });
      fireEvent.click(codeButton);
      const codePre = statePres(card as HTMLElement).find((pre) =>
        /\b(useForm|createForm)\(/.test(pre.textContent ?? ""),
      );
      expect(codePre, `code panel on tab "${tab.textContent}"`).toBeDefined();
      expect(codePre?.textContent ?? "").not.toContain("useDemoForm");
      fireEvent.click(codeButton);
      expect(statePres(card as HTMLElement)).toHaveLength(0);

      // View state: every demo registers its live form with the shell —
      // except the single-file generated demo, which has no form instance
      // to register (the button must be disabled, not broken).
      const stateButton = scope.getByRole("button", {
        name: "View state",
      }) as HTMLButtonElement;
      if (NO_REGISTERED_FORM.has(tab.textContent ?? "")) {
        expect(
          stateButton.disabled,
          `View state enabled without a registered form on tab "${tab.textContent}"`,
        ).toBe(true);
        return;
      }
      expect(
        stateButton.disabled,
        `View state disabled on tab "${tab.textContent}"`,
      ).toBe(false);
      fireEvent.click(stateButton);
      const statePre = statePres(card as HTMLElement).find((pre) =>
        (pre.textContent ?? "").includes('"values"'),
      );
      expect(statePre, `state panel on tab "${tab.textContent}"`).toBeDefined();
      fireEvent.click(stateButton);
      expect(statePres(card as HTMLElement)).toHaveLength(0);
    },
    30_000,
  );
});
