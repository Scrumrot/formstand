import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { focusField } from "../../src/react/focusError";

afterEach(cleanup);

describe("focusField", () => {
  it("focuses the control whose name matches the path exactly", () => {
    render(
      <form>
        <input type="text" name="name" aria-label="Name" />
        <input type="text" name="email" aria-label="Email" />
      </form>,
    );
    expect(focusField("email")).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("a container path focuses its first descendant in DOM order", () => {
    render(
      <form>
        <input type="text" name="name" aria-label="Name" />
        <input type="text" name="address.street" aria-label="Street" />
        <input type="text" name="address.city" aria-label="City" />
      </form>,
    );
    expect(focusField("address")).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Street"));
  });

  it("does not treat a shared name prefix as a descendant", () => {
    render(
      <form>
        <input type="text" name="addressLine" aria-label="Line" />
        <input type="text" name="address.city" aria-label="City" />
      </form>,
    );
    expect(focusField("address")).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("City"));
  });

  it("returns false when nothing focusable matches", () => {
    render(
      <div>
        <input type="hidden" name="csrf" defaultValue="tok" />
        <input type="text" name="email" aria-label="Email" disabled />
        <dialog>
          <input type="text" name="email" aria-label="Dialog email" />
        </dialog>
      </div>,
    );
    const before = document.activeElement;
    expect(focusField("email")).toBe(false);
    expect(focusField("nowhere")).toBe(false);
    expect(document.activeElement).toBe(before);
  });

  it("skips an unfocusable match for the next one in DOM order", () => {
    render(
      <div>
        <dialog>
          <input type="text" name="email" aria-label="Dialog email" />
        </dialog>
        <form>
          <input type="text" name="email" aria-label="Visible email" />
        </form>
      </div>,
    );
    expect(focusField("email")).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Visible email"));
  });

  it("respects the root scope", () => {
    const { container } = render(
      <div>
        <form aria-label="first">
          <input type="text" name="email" aria-label="First email" />
        </form>
        <form aria-label="second">
          <input type="text" name="email" aria-label="Second email" />
        </form>
      </div>,
    );
    const second = container.querySelectorAll("form")[1];
    if (second === undefined) throw new Error("second form not rendered");
    expect(focusField("email", second)).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Second email"));
  });
});

describe('focusField("") — whole-form scope', () => {
  it("focuses the first focusable control within an explicit root", () => {
    const { container } = render(
      <form>
        <input type="hidden" name="csrf" defaultValue="tok" />
        <input type="text" name="name" aria-label="Name" />
        <input type="text" name="email" aria-label="Email" />
      </form>,
    );
    const formEl = container.querySelector("form");
    if (formEl === null) throw new Error("form not rendered");
    expect(focusField("", formEl)).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("focuses the first control under the default document scope with a single form", () => {
    render(
      <form>
        <input type="text" name="name" aria-label="Name" />
        <input type="text" name="email" aria-label="Email" />
      </form>,
    );
    expect(focusField("")).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("refuses to guess between multiple forms under the default document scope", () => {
    // Mirrors focusFirstError's root-"" fallback: "first control" would be a
    // guess when the page holds several <form>s — return false instead.
    render(
      <div>
        <form aria-label="first">
          <input type="text" name="a" aria-label="A" />
        </form>
        <form aria-label="second">
          <input type="text" name="b" aria-label="B" />
        </form>
      </div>,
    );
    const before = document.activeElement;
    expect(focusField("")).toBe(false);
    expect(document.activeElement).toBe(before);
  });
});
