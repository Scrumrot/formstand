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

});
