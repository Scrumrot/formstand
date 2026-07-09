import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../examples/src/App";

afterEach(cleanup);

const statePres = (card: HTMLElement): readonly HTMLElement[] =>
  Array.from(card.querySelectorAll<HTMLElement>("pre.state-dump"));

// The deployed playground is the library's public face — render every tab
// for real so a runtime crash (e.g. an uncached-selector infinite loop,
// React error #185) fails CI instead of shipping a blank page. One walk
// covers rendering AND the shell's View code / View state toggles.
describe("examples playground smoke test", () => {
  // Deliberately heavy: 27 tabs of full component trees (MUI + Radix)
  // rendered twice each under StrictMode, plus both shell toggles — CI
  // runners with V8 coverage instrumentation blow the default 5s.
  it(
    "every tab renders content and has working View code / View state toggles",
    { timeout: 30_000 },
    () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    // The sidebar is a tree view: demo leaves carry the nav-tab class and
    // switch tabs when their content row is clicked.
    const tabs = Array.from(
      document.querySelectorAll<HTMLElement>(".nav-tab .MuiTreeItem-content"),
    );
    expect(tabs.length).toBeGreaterThanOrEqual(18);

    tabs.forEach((tab) => {
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

      // View code: the shell shows the tab's ?raw source, which always
      // contains a form-creation call (useForm for per-mount demos,
      // createForm for the module-singleton ones) — with the
      // playground-harness useDemoForm lines stripped so copied code
      // compiles outside the playground.
      const codeButton = scope.getByRole("button", { name: "View code" });
      fireEvent.click(codeButton);
      const codePre = statePres(card as HTMLElement).find((pre) =>
        /\b(useForm|createForm)\(/.test(pre.textContent ?? ""),
      );
      expect(codePre, `code panel on tab "${tab.textContent}"`).toBeDefined();
      expect(codePre?.textContent ?? "").not.toContain("useDemoForm");
      fireEvent.click(codeButton);
      expect(statePres(card as HTMLElement)).toHaveLength(0);

      // View state: every demo registers its live form with the shell.
      const stateButton = scope.getByRole("button", {
        name: "View state",
      }) as HTMLButtonElement;
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
    });
    },
  );
});
