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

  // The optional field is CLEARABLE (0.18): its schema accepts undefined,
  // so the empty option is a real choice, not a placeholder-only state.
  it("shows the placeholder as a selectable empty option (optional is clearable)", () => {
    render(<Harness placeholder="Pick a theme" />);
    const option = screen.getByText("Pick a theme") as HTMLOptionElement;
    expect(option.value).toBe("");
    expect(option.disabled).toBe(false);
  });

  it("keeps the empty option after a choice and clears back to undefined", () => {
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    fireEvent.change(select, { target: { value: "light" } });
    expect(select.options).toHaveLength(3);
    expect(select.value).toBe("light");
    fireEvent.change(select, { target: { value: "" } });
    expect(select.value).toBe("");
    expect(
      (captured.form?.getState().values as { theme?: string }).theme,
    ).toBe(undefined);
  });
});

describe("SelectField on a REQUIRED enum (not clearable)", () => {
  const requiredSchema = z.object({ tier: z.enum(["basic", "pro"]) });
  const RequiredHarness = ({
    placeholder,
  }: Readonly<{ placeholder?: string }>) => {
    const form = useForm(requiredSchema, { initialValues: {} as never });
    return (
      <SelectField
        form={form}
        path="tier"
        label="Tier"
        {...(placeholder === undefined ? {} : { placeholder })}
        options={[
          { value: "basic", label: "Basic" },
          { value: "pro", label: "Pro" },
        ]}
      />
    );
  };

  it("keeps the placeholder disabled — no legal blank to clear to", () => {
    render(<RequiredHarness placeholder="Pick a tier" />);
    const option = screen.getByText("Pick a tier") as HTMLOptionElement;
    expect(option.disabled).toBe(true);
  });

  it("drops the implicit empty option once a value is chosen", () => {
    render(<RequiredHarness />);
    const select = screen.getByLabelText("Tier") as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    fireEvent.change(select, { target: { value: "basic" } });
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe("basic");
  });
});

describe("SelectField with duplicate option values", () => {
  const DupHarness = () => {
    const form = useForm(schema, { initialValues: {} });
    return (
      <SelectField
        form={form}
        path="theme"
        label="Theme"
        options={[
          { value: "light", label: "Light" },
          { value: "light", label: "Light (alias)" },
        ]}
      />
    );
  };

  it("renders two options sharing a value without duplicate-key errors", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DupHarness />);
    expect(screen.getByText("Light")).toBeDefined();
    expect(screen.getByText("Light (alias)")).toBeDefined();
    const warned = errorSpy.mock.calls.some((args) =>
      String(args[0]).includes("same key"),
    );
    expect(warned).toBe(false);
    errorSpy.mockRestore();
  });
});

describe("SelectField with an empty-string value", () => {
  const emptyStringSchema = z.object({
    plan: z.string(),
  });

  const EmptyStringHarness = () => {
    const form = useForm(emptyStringSchema, { initialValues: { plan: "" } });
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

  it("renders the empty option: '' displays as blank, not as the first entry", () => {
    render(<EmptyStringHarness />);
    const select = screen.getByLabelText("Plan") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options).toHaveLength(3);
    expect(select.options[0]?.value).toBe("");
  });
});

describe("SelectField with an explicit ''-valued option", () => {
  const explicitEmptySchema = z.object({
    plan: z.string(),
  });

  const ExplicitEmptyHarness = () => {
    const form = useForm(explicitEmptySchema, { initialValues: { plan: "" } });
    return (
      <SelectField
        form={form}
        path="plan"
        label="Plan"
        options={[
          { value: "", label: "None" },
          { value: "basic", label: "Basic" },
        ]}
      />
    );
  };

  it("suppresses the implicit blank option so the labelled '' entry shows", () => {
    render(<ExplicitEmptyHarness />);
    const select = screen.getByLabelText("Plan") as HTMLSelectElement;
    expect(select.value).toBe("");
    // No duplicate value="" — the author's labelled option is the blank state.
    expect(select.options).toHaveLength(2);
    expect(select.options[0]?.text).toBe("None");
    expect(select.options[0]?.disabled).toBe(false);
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
