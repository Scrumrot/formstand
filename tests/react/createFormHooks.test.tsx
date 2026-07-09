import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { createFormHooks } from "../../src/react/createFormHooks";

const schema = z.object({
  customer: z.string().min(1, "required"),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1, "required"),
        quantity: z.number().positive(),
      }),
    )
    .min(1, "at least one item"),
});

const initialValues = {
  customer: "Ada",
  lineItems: [{ description: "widgets", quantity: 2 }],
};

const makeForm = () => createForm(schema, { initialValues, mode: "onBlur" });

describe("createFormHooks", () => {
  it("bakes the name into the hook keys (runtime and types)", () => {
    const hooks = createFormHooks(makeForm(), "invoice");
    expect(Object.keys(hooks).sort()).toEqual(
      [
        "useInvoiceField",
        "useInvoiceFieldArray",
        "useInvoiceSelector",
        "useInvoiceSelectorShallow",
        "useInvoiceError",
        "useInvoiceIsDirty",
        "useInvoiceIsValid",
        "useInvoiceIsSubmitting",
        "useInvoiceSubmitCount",
      ].sort(),
    );
    expectTypeOf(hooks).toHaveProperty("useInvoiceField");
    expectTypeOf(hooks).toHaveProperty("useInvoiceIsDirty");
  });

  it("no name means unprefixed keys", () => {
    const hooks = createFormHooks(makeForm());
    expect(Object.keys(hooks)).toContain("useField");
    expect(Object.keys(hooks)).toContain("useSelector");
    expectTypeOf(hooks).toHaveProperty("useField");
  });

  it("bound useField reads and writes with inferred value types", () => {
    const form = makeForm();
    const { useInvoiceField } = createFormHooks(form, "invoice");
    const { result } = renderHook(() => useInvoiceField("customer"));

    expectTypeOf(result.current.value).toEqualTypeOf<string>();
    expect(result.current.value).toBe("Ada");

    act(() => {
      result.current.setValue("Grace");
    });
    expect(result.current.value).toBe("Grace");
    expect(form.getState().values.customer).toBe("Grace");
  });

  it("bound useFieldArray infers items through the path", () => {
    const { useInvoiceFieldArray } = createFormHooks(makeForm(), "invoice");
    const { result } = renderHook(() => useInvoiceFieldArray("lineItems"));

    expectTypeOf(result.current.items).toEqualTypeOf<
      readonly { description: string; quantity: number }[]
    >();
    act(() => {
      result.current.push({ description: "gears", quantity: 1 });
    });
    expect(result.current.length).toBe(2);
  });

  it("bound selector and scoped flags work", () => {
    const form = makeForm();
    const { useInvoiceSelector, useInvoiceIsDirty, useInvoiceIsValid } =
      createFormHooks(form, "invoice");
    const { result } = renderHook(() => ({
      customer: useInvoiceSelector((s) => s.values.customer),
      dirty: useInvoiceIsDirty("customer"),
      valid: useInvoiceIsValid("lineItems"),
    }));

    expectTypeOf(result.current.customer).toEqualTypeOf<string>();
    expect(result.current.dirty).toBe(false);
    expect(result.current.valid).toBe(true);

    act(() => {
      form.setValue("customer", "");
      form.validateField("customer");
    });
    expect(result.current.dirty).toBe(true);
    // The error is on customer, not under lineItems.
    expect(result.current.valid).toBe(true);
  });

  it("typo'd paths and typo'd destructured names are compile errors", () => {
    const hooks = createFormHooks(makeForm(), "invoice");
    renderHook(() => {
      // @ts-expect-error "custmer" is not a path of the schema
      return hooks.useInvoiceField("custmer");
    });
    // @ts-expect-error useInvoceField is not a key of the returned hooks
    expectTypeOf(hooks).toHaveProperty("useInvoceField");
  });

  it("lowercase names are capitalized in the keys", () => {
    const hooks = createFormHooks(makeForm(), "invoice");
    expect(Object.keys(hooks)).toContain("useInvoiceField");
    expect(Object.keys(hooks)).not.toContain("useinvoiceField");
  });
});
