import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { NumberField } from "../../src/react/fields";
import { useField } from "../../src/react/useField";

// Regression pin for the third November 2026 review: a key SHARED by
// several union variants read the first variant's wrapper whatever was
// active, so clearing the field on a variant that accepts null wrote the
// other variant's undefined and errored.

const schema = z.object({
  pay: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), amount: z.number() }),
    z.object({ kind: z.literal("b"), amount: z.number().nullable() }),
  ]),
});

describe("useField on a key shared by union variants", () => {
  it("clears to null on the active nullable variant", async () => {
    const form = createForm(schema, {
      initialValues: { pay: { kind: "b", amount: 5 } },
      mode: "onChange",
    });
    const { container } = render(<NumberField form={form} path="pay.amount" />);
    await act(async () => {
      fireEvent.change(container.querySelector("input") as HTMLInputElement, {
        target: { value: "" },
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(form.getState().values.pay).toEqual({ kind: "b", amount: null });
    expect(form.getState().errors).toEqual({});
  });

  it("follows the discriminant as it changes", () => {
    const form = createForm(schema, {
      initialValues: { pay: { kind: "a", amount: 5 } },
    });
    const { result } = renderHook(() => useField(form, "pay.amount"));
    expect(result.current.emptyValue).toBeUndefined();
    expect(result.current.clearable).toBe(false);
    act(() => {
      form.setValue("pay", { kind: "b", amount: 5 });
    });
    expect(result.current.emptyValue).toBeNull();
    expect(result.current.clearable).toBe(true);
  });
});
