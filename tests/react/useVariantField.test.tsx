import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useVariantField } from "../../src/react/useVariantField";
import { useForm } from "../../src/react/useForm";

// A discriminated-union field: payment is card | paypal, keyed on method.
const schema = z.object({
  amount: z.number(),
  payment: z.discriminatedUnion("method", [
    z.object({ method: z.literal("card"), cardNumber: z.string() }),
    z.object({ method: z.literal("paypal"), email: z.string() }),
  ]),
});

const setup = () =>
  renderHook(() => {
    const form = useForm(schema, {
      initialValues: {
        amount: 0,
        payment: { method: "card", cardNumber: "" },
      },
    });
    return {
      form,
      method: useField(form, "payment.method"),
      cardNumber: useVariantField(form, "payment", "cardNumber"),
      email: useVariantField(form, "payment", "email"),
    };
  });

describe("useVariantField", () => {
  it("binds a variant field by the joined path and reads its value", () => {
    const { result } = setup();
    // The discriminant is a common key — plain useField, fully typed.
    expect(result.current.method.value).toBe("card");
    expect(result.current.cardNumber.path).toBe("payment.cardNumber");

    act(() => result.current.cardNumber.setValue("4242"));
    expect(result.current.cardNumber.value).toBe("4242");
    expect(result.current.form.getState().values.payment).toEqual({
      method: "card",
      cardNumber: "4242",
    });
  });

  it("types the field value across the declaring variants, widened undefined", () => {
    const { result } = setup();
    // string (card's cardNumber) widened with undefined (absent in paypal).
    expectTypeOf(result.current.cardNumber.value).toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(result.current.email.value).toEqualTypeOf<
      string | undefined
    >();
    // The discriminant stays exactly typed through plain useField.
    expectTypeOf(result.current.method.value).toEqualTypeOf<
      "card" | "paypal"
    >();
  });

  it("rejects a field name that no variant declares", () => {
    renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          amount: 0,
          payment: { method: "card", cardNumber: "" },
        },
      });
      // @ts-expect-error "nope" is not a variant field of payment
      useVariantField(form, "payment", "nope");
      // @ts-expect-error the discriminant is a COMMON key — bind it with
      // plain useField, not useVariantField
      useVariantField(form, "payment", "method");
      return null;
    });
  });

  it("a field from the inactive variant reads undefined", () => {
    const { result } = setup();
    // method is "card", so email (paypal-only) has no value.
    expect(result.current.email.value).toBeUndefined();
  });

  it("survives a variant switch: the new variant's field becomes writable", () => {
    const { result } = setup();
    act(() => {
      result.current.method.setValue("paypal");
      result.current.email.setValue("a@b.com");
    });
    expect(result.current.form.getState().values.payment).toMatchObject({
      method: "paypal",
      email: "a@b.com",
    });
  });

  it("works on a schema-less structural form too", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          amount: 0,
          payment: { method: "card", cardNumber: "x" },
        },
      });
      // Force the schema-less overload by widening.
      return useVariantField<string>(
        form as never,
        "payment",
        "cardNumber",
      );
    });
    expect(result.current.value).toBe("x");
  });
});
