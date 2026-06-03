import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createFormContext } from "../../src/react/FormContext";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  name: z.string(),
  email: z.email(),
});

const { Provider: FormProvider, useFormContext } = createFormContext<
  typeof schema
>();

const NameDisplay = () => {
  const form = useFormContext();
  const name = useField(form, "name");
  return <div data-testid="name">{name.value}</div>;
};

const Outer = () => {
  const form = useForm(schema, { initialValues: { name: "Tim", email: "" } });
  return (
    <FormProvider form={form}>
      <NameDisplay />
      <button
        type="button"
        onClick={() => form.setValue("name", "Jane")}
        data-testid="rename"
      >
        rename
      </button>
    </FormProvider>
  );
};

describe("createFormContext", () => {
  afterEach(() => {
    cleanup();
  });

  it("provides the form to a nested consumer without prop drilling", () => {
    render(<Outer />);
    expect(screen.getByTestId("name").textContent).toBe("Tim");
    act(() => {
      screen.getByTestId("rename").click();
    });
    expect(screen.getByTestId("name").textContent).toBe("Jane");
  });

  it("throws if useFormContext is called outside the Provider", () => {
    const Standalone = () => {
      useFormContext();
      return null;
    };
    expect(() => render(<Standalone />)).toThrow(
      /useFormContext must be used/,
    );
  });

  it("useFormContext is typed as Form<TSchema>", () => {
    const TypeCheck = () => {
      const form = useFormContext();
      expectTypeOf(form.schema).toEqualTypeOf<typeof schema>();
      const v = form.getField("name");
      expectTypeOf(v).toEqualTypeOf<string>();
      return null;
    };
    void TypeCheck;
  });
});
