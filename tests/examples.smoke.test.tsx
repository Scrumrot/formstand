import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../examples/src/App";

afterEach(cleanup);

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
});
