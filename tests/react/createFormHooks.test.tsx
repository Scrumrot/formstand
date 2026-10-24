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
        "useInvoiceVariantField",
        "useInvoiceFieldArray",
        "useInvoiceVariantFieldArray",
        "useInvoiceSelector",
        "useInvoiceSelectorShallow",
        "useInvoiceError",
        "useInvoiceIsDirty",
        "useInvoiceIsValid",
        "useInvoiceIsSubmitting",
        "useInvoiceSubmitCount",
        "useInvoiceIsValidating",
        "useInvoiceValues",
        "useInvoiceFields",
        "useInvoiceSteps",
      ].sort(),
    );
    expectTypeOf(hooks).toHaveProperty("useInvoiceField");
    expectTypeOf(hooks).toHaveProperty("useInvoiceVariantField");
    expectTypeOf(hooks).toHaveProperty("useInvoiceVariantFieldArray");
    expectTypeOf(hooks).toHaveProperty("useInvoiceIsDirty");
  });

  it("the bound variant-field hook types the value and rejects common keys", () => {
    const unionSchema = z.object({
      payment: z.discriminatedUnion("method", [
        z.object({ method: z.literal("card"), cardNumber: z.string() }),
        z.object({ method: z.literal("paypal"), email: z.string() }),
      ]),
    });
    const { usePayVariantField } = createFormHooks(
      createForm(unionSchema, {
        initialValues: { payment: { method: "card", cardNumber: "" } },
      }),
      "pay",
    );
    const { result } = renderHook(() =>
      usePayVariantField("payment", "cardNumber"),
    );
    expectTypeOf(result.current.value).toEqualTypeOf<string | undefined>();
  });

  it("the bound variant-array hook types the rows and rejects common keys", () => {
    const unionSchema = z.object({
      top: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("asphalt"),
          lights: z.array(z.object({ color: z.string() })),
          tags: z.array(z.string()),
        }),
        z.object({ kind: z.literal("grass"), tags: z.array(z.string()) }),
      ]),
    });
    // A const form, not an inline createForm(...) argument: inline, the
    // inner call infers its depth from the outer unresolved parameter and
    // every depth-typed bound hook collapses (a separate fix).
    const topForm = createForm(unionSchema, {
      initialValues: { top: { kind: "asphalt", lights: [], tags: [] } },
    });
    const { useTopVariantFieldArray, useTopFieldArray } = createFormHooks(
      topForm,
      "top",
    );
    const { result } = renderHook(() => ({
      lights: useTopVariantFieldArray("top", "lights"),
      // The common-key array binds with the plain bound array hook.
      tags: useTopFieldArray("top.tags"),
    }));
    expectTypeOf(result.current.lights.items).toEqualTypeOf<
      readonly { color: string }[]
    >();
    expectTypeOf(result.current.tags.items).toEqualTypeOf<readonly string[]>();
    act(() => result.current.lights.push({ color: "red" }));
    expect(result.current.lights.items).toEqual([{ color: "red" }]);
    // @ts-expect-error a common key is not a variant path
    renderHook(() => useTopVariantFieldArray("top", "tags"));
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
