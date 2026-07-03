import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { Form } from "../../src/core/createForm";
import { NumberField } from "../../src/react/fields";
import { useForm } from "../../src/react/useForm";

afterEach(cleanup);

const schema = z.object({ amount: z.number().optional() });
type AmountForm = Form<typeof schema>;

const captured: { form: AmountForm | null } = { form: null };

const Harness = () => {
  const form = useForm(schema, { initialValues: { amount: 5 } });
  captured.form = form;
  return <NumberField form={form} path="amount" label="Amount" />;
};

describe("NumberField with a null (nullable) value", () => {
  const nullableSchema = z.object({ qty: z.number().nullable() });
  type QtyForm = Form<typeof nullableSchema>;

  const capturedNullable: { form: QtyForm | null } = { form: null };

  const NullableHarness = () => {
    const form = useForm(nullableSchema, { initialValues: { qty: null } });
    capturedNullable.form = form;
    return <NumberField form={form} path="qty" label="Qty" />;
  };

  it("renders blank, not the literal text 'null'", () => {
    render(<NullableHarness />);
    const input = screen.getByLabelText("Qty") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("clearing the input round-trips to null, staying valid and clean", () => {
    render(<NullableHarness />);
    const input = screen.getByLabelText("Qty") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
    expect(capturedNullable.form?.getState().values.qty).toBe(5);
    fireEvent.change(input, { target: { value: "" } });
    expect(capturedNullable.form?.getState().values.qty).toBeNull();
    expect(capturedNullable.form?.getFieldState("qty").dirty).toBe(false);
    expect(capturedNullable.form?.validate().kind).toBe("valid");
  });

  it("clearing writes null even when the initial value was a number (schema-introspected)", () => {
    const NumericInitialHarness = () => {
      const form = useForm(nullableSchema, { initialValues: { qty: 5 } });
      capturedNullable.form = form;
      return <NumberField form={form} path="qty" label="Qty" />;
    };
    render(<NumericInitialHarness />);
    const input = screen.getByLabelText("Qty") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    // The schema says .nullable(), so the empty write is null regardless of
    // what the field started as — the old initial-value heuristic would
    // have written undefined here and failed validation.
    expect(capturedNullable.form?.getState().values.qty).toBeNull();
    expect(capturedNullable.form?.validate().kind).toBe("valid");
  });
});

describe("NumberField input parsing", () => {
  it("treats whitespace as empty instead of zero", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    expect(captured.form?.getState().values.amount).toBeUndefined();
    expect(input.value).toBe("   ");
  });

  it("rejects Infinity while keeping the text visible", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Infinity" } });
    expect(captured.form?.getState().values.amount).toBe(5);
    expect(input.value).toBe("Infinity");
  });

  it("keeps partial entries while typing and pushes finite parses", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-" } });
    expect(input.value).toBe("-");
    expect(captured.form?.getState().values.amount).toBe(5);
    fireEvent.change(input, { target: { value: "-3" } });
    expect(captured.form?.getState().values.amount).toBe(-3);
  });
});

describe("NumberField external value changes", () => {
  it("shows an external reset even while the input holds raw text", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12" } });
    expect(input.value).toBe("12");

    act(() => {
      captured.form?.reset();
    });
    expect(captured.form?.getState().values.amount).toBe(5);
    expect(input.value).toBe("5");
  });
});
