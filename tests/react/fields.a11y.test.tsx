import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { TextField } from "../../src/react/fields";
import { useForm } from "../../src/react/useForm";

afterEach(cleanup);

const schema = z.object({
  email: z.string().min(3, "too short"),
});

const Harness = () => {
  const form = useForm(schema, {
    initialValues: { email: "" },
    mode: "onBlur",
  });
  return <TextField form={form} path="email" label="Email" />;
};

describe("field accessibility wiring", () => {
  it("sets name from the path and no aria-invalid while clean", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.name).toBe("email");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("links the error message via aria-describedby and role=alert", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    fireEvent.blur(input);

    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.id).toBe(describedBy);
    expect(alert.textContent).toBe("too short");
  });

  it("forwards ref to the underlying input", () => {
    const RefHarness = () => {
      const inputRef = useRef<HTMLInputElement>(null);
      const form = useForm(schema, { initialValues: { email: "" } });
      return (
        <>
          <TextField form={form} path="email" label="Email" ref={inputRef} />
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
          >
            focus
          </button>
        </>
      );
    };
    render(<RefHarness />);
    fireEvent.click(screen.getByText("focus"));
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });
});
