import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../examples/src/App";

afterEach(cleanup);

const statePres = (card: HTMLElement): readonly HTMLElement[] =>
  Array.from(card.querySelectorAll<HTMLElement>("pre.state-dump"));

// The deployed playground is the library's public face — render every tab
// for real so a runtime crash (e.g. an uncached-selector infinite loop,
// React error #185) fails CI instead of shipping a blank page.
describe("examples playground smoke test", () => {
  it("renders the app and every tab without crashing", () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    const tabs = screen
      .getAllByRole("button")
      .filter((el) => el.className.includes("tab"));
    expect(tabs.length).toBeGreaterThanOrEqual(18);
    tabs.forEach((tab) => {
      fireEvent.click(tab);
      // The tab's demo rendered something into the card.
      expect(
        document.querySelector(".card")?.childNodes.length ?? 0,
      ).toBeGreaterThan(0);
    });
  });

  it("provides working View code / View state toggles on every tab", () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    const tabs = screen
      .getAllByRole("button")
      .filter((el) => el.className.includes("tab"));
    tabs.forEach((tab) => {
      fireEvent.click(tab);
      const card = document.querySelector<HTMLElement>(".card");
      expect(card).not.toBeNull();
      const scope = within(card as HTMLElement);

      // View code: the shell shows the tab's ?raw source, which always
      // contains its useForm call.
      const codeButton = scope.getByRole("button", { name: "View code" });
      fireEvent.click(codeButton);
      const codePre = statePres(card as HTMLElement).find((pre) =>
        (pre.textContent ?? "").includes("useForm"),
      );
      expect(codePre, `code panel on tab "${tab.textContent}"`).toBeDefined();
      fireEvent.click(codeButton);
      expect(statePres(card as HTMLElement)).toHaveLength(0);

      // View state: must never be disabled — every demo registers its live
      // form with the shell via useDemoForm.
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
  });
});
