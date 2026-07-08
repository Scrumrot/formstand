import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { focusFirstError } from "../../src/react/focusError";
import { TextField } from "../../src/react/fields";
import { useForm } from "../../src/react/useForm";

afterEach(cleanup);

const schema = z.object({
  name: z.string().min(2, "name too short"),
  email: z.string().min(3, "email too short"),
});

const Harness = ({
  initial,
}: Readonly<{ initial: { name: string; email: string } }>) => {
  const form = useForm(schema, { initialValues: initial });
  return (
    <form
      onSubmit={form.handleSubmit(
        () => {},
        (errors) => {
          focusFirstError(errors);
        },
      )}
    >
      <TextField form={form} path="name" label="Name" />
      <TextField form={form} path="email" label="Email" />
      <button type="submit">go</button>
    </form>
  );
};

describe("focusFirstError", () => {
  it("focuses the first errored control in DOM order on failed submit", async () => {
    render(<Harness initial={{ name: "x", email: "y" }} />);
    fireEvent.click(screen.getByText("go"));
    await screen.findByText("name too short");
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("skips valid fields and focuses the first one with an error", async () => {
    render(<Harness initial={{ name: "long enough", email: "y" }} />);
    fireEvent.click(screen.getByText("go"));
    await screen.findByText("email too short");
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("returns false and focuses nothing when the error map is empty", () => {
    render(<Harness initial={{ name: "ok name", email: "a@b.c" }} />);
    expect(focusFirstError({})).toBe(false);
  });

  it("a root '' error does not steal focus from the actually errored field", () => {
    render(<Harness initial={{ name: "long enough", email: "y" }} />);
    focusFirstError({
      "": ["form-wide refine failed"],
      email: ["email too short"],
    });
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("a root-only error falls back to the first control", () => {
    render(<Harness initial={{ name: "long enough", email: "a@b.c" }} />);
    expect(focusFirstError({ "": ["form-wide refine failed"] })).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("the root fallback skips hidden and disabled controls", () => {
    render(
      <form>
        <input type="hidden" name="csrf" defaultValue="tok" />
        <input type="text" name="visible" aria-label="Visible" />
      </form>,
    );
    expect(focusFirstError({ "": ["form-wide refine failed"] })).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Visible"));
  });
});

describe("focusFirstError multi-form containment", () => {
  const TwoForms = () => (
    <div>
      <form aria-label="first form">
        <input type="text" name="a" aria-label="A" />
      </form>
      <form aria-label="second form">
        <input type="text" name="b" aria-label="B" />
      </form>
    </div>
  );

  it("a root-only error with document scope and multiple forms returns false", () => {
    render(<TwoForms />);
    const before = document.activeElement;
    expect(focusFirstError({ "": ["form-wide refine failed"] })).toBe(false);
    expect(document.activeElement).toBe(before);
  });

  it("a root-only error with a single form still focuses its first control", () => {
    render(
      <form>
        <input type="text" name="only" aria-label="Only" />
      </form>,
    );
    expect(focusFirstError({ "": ["form-wide refine failed"] })).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Only"));
  });

  it("an explicit root keeps the fallback and scopes it to that form", () => {
    const { container } = render(<TwoForms />);
    const second = container.querySelectorAll("form")[1];
    if (second === undefined) throw new Error("second form not rendered");
    expect(focusFirstError({ "": ["form-wide refine failed"] }, second)).toBe(
      true,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("B"));
  });
});

describe("focusFirstError skips controls that cannot take focus", () => {
  it("passes over a name match inside a closed <dialog> to the visible one", () => {
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
    expect(focusFirstError({ email: ["email required"] })).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Visible email"));
  });

  it("returns false when the only match lives in a closed <dialog>", () => {
    render(
      <dialog>
        <input type="text" name="email" aria-label="Dialog email" />
      </dialog>,
    );
    const before = document.activeElement;
    expect(focusFirstError({ email: ["email required"] })).toBe(false);
    expect(document.activeElement).toBe(before);
  });

  it("still matches inside an OPEN <dialog>", () => {
    render(
      <dialog open>
        <input type="text" name="email" aria-label="Dialog email" />
      </dialog>,
    );
    expect(focusFirstError({ email: ["email required"] })).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Dialog email"));
  });
});
