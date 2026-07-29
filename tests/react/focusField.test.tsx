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

// The [id=path] fallback: composite widgets (antd's Select, notably) render
// no `name` anywhere but forward id={path} to their real focusable control.
// A path that matches NO named control tries the element whose id IS the
// path — exact match only, with the same focusability rules.
describe("focusField id fallback", () => {
  it("falls back to the element whose id is exactly the path", () => {
    render(
      <form>
        <input type="text" name="name" aria-label="Name" />
        {/* antd-like combobox input: no name, id carries the path */}
        <input type="text" id="address.region" aria-label="Region" />
      </form>,
    );
    expect(focusField("address.region")).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Region"));
  });

  it("is exact-match only — no descendant semantics for ids", () => {
    render(
      <form>
        <input type="text" id="address.region" aria-label="Region" />
      </form>,
    );
    // The name walk would cover descendants; an id names ONE element, so
    // the container path finds nothing here.
    expect(focusField("address")).toBe(false);
  });

  it("never applies when a named control matches the path", () => {
    render(
      <form>
        <input type="text" id="email" aria-label="Id only" />
        <input type="text" name="email" aria-label="Named" />
      </form>,
    );
    expect(focusField("email")).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Named"));
  });

  it("id candidates obey the focusability rules", () => {
    render(
      <div>
        <input type="text" id="qty" aria-label="Disabled" disabled />
      </div>,
    );
    const before = document.activeElement;
    expect(focusField("qty")).toBe(false);
    expect(document.activeElement).toBe(before);
  });
});
