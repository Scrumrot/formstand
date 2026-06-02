import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextField,
} from "../../src/react/fields";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  name: z.string().min(2),
  age: z.number().optional(),
  agree: z.boolean(),
  theme: z.enum(["light", "dark"]),
});

const Harness = () => {
  const form = useForm(schema, {
    initialValues: { name: "", age: undefined, agree: false, theme: "light" },
  });
  return (
    <div>
      <TextField form={form} path="name" label="Name" placeholder="name" />
      <NumberField form={form} path="age" label="Age" placeholder="age" />
      <CheckboxField form={form} path="agree" label="agree" />
      <SelectField
        form={form}
        path="theme"
        label="Theme"
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </div>
  );
};

describe("bound input components", () => {
  afterEach(() => {
    cleanup();
  });

  it("TextField updates value via input event", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("name") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "Tim" } });
    });
    expect(input.value).toBe("Tim");
  });

  it("NumberField coerces strings to numbers", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("age") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "42" } });
    });
    expect(input.value).toBe("42");
  });

  it("CheckboxField toggles", () => {
    render(<Harness />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    act(() => {
      fireEvent.click(checkbox);
    });
    expect(checkbox.checked).toBe(true);
  });

  it("SelectField switches options", () => {
    render(<Harness />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("light");
    act(() => {
      fireEvent.change(select, { target: { value: "dark" } });
    });
    expect(select.value).toBe("dark");
  });
});
