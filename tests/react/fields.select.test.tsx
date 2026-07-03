import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SelectField } from "../../src/react/fields";
import { useForm } from "../../src/react/useForm";

afterEach(cleanup);

const schema = z.object({
  theme: z.enum(["light", "dark"]).optional(),
});

const nullableSchema = z.object({
  plan: z.enum(["basic", "pro"]).nullable(),
});

type FormApi = Readonly<{ getState: () => { values: unknown } }>;

const captured: { form: FormApi | null } = { form: null };

const Harness = ({ placeholder }: Readonly<{ placeholder?: string }>) => {
  const form = useForm(schema, { initialValues: {} });
  captured.form = form;
  return (
    <SelectField
      form={form}
      path="theme"
      label="Theme"
      {...(placeholder === undefined ? {} : { placeholder })}
      options={[
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
    />
  );
};

describe("SelectField with an undefined value", () => {
  it("stays controlled (value '') and does not warn when a value arrives", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(select.value).toBe("");

    fireEvent.change(select, { target: { value: "dark" } });
    expect(select.value).toBe("dark");
    expect(
      (captured.form?.getState().values as { theme?: string }).theme,
    ).toBe("dark");

    const warned = errorSpy.mock.calls.some((args) =>
      String(args[0]).includes("uncontrolled"),
    );
    expect(warned).toBe(false);
    errorSpy.mockRestore();
  });

  it("shows the placeholder as a disabled empty option", () => {
    render(<Harness placeholder="Pick a theme" />);
    const option = screen.getByText("Pick a theme") as HTMLOptionElement;
    expect(option.value).toBe("");
    expect(option.disabled).toBe(true);
  });

  it("drops the implicit empty option once a value is chosen (no placeholder)", () => {
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    fireEvent.change(select, { target: { value: "light" } });
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe("light");
  });
});

describe("SelectField with a null (nullable) value", () => {
  const NullableHarness = () => {
    const form = useForm(nullableSchema, { initialValues: { plan: null } });
    return (
      <SelectField
        form={form}
        path="plan"
        label="Plan"
        options={[
          { value: "basic", label: "Basic" },
          { value: "pro", label: "Pro" },
        ]}
      />
    );
  };

  it("renders the empty option so the blank state is visible, not the first entry", () => {
    render(<NullableHarness />);
    const select = screen.getByLabelText("Plan") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options).toHaveLength(3);
    expect(select.options[0]?.value).toBe("");
  });
});
