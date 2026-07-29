import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { type FieldFormApi, useField } from "../../src/react/useField";
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

  // Regression (2026-07 review #4): an OPTIONAL/nullable union must keep the
  // guard — UnionValueAt strips the nullish part (NonNullable), so the
  // discriminant and common keys are still rejected. Without the fix, the
  // undefined member collapsed keyof to never and every key leaked through.
  it("keeps the guard when the union field is optional", () => {
    const optionalSchema = z.object({
      payment: z
        .discriminatedUnion("method", [
          z.object({ method: z.literal("card"), cardNumber: z.string() }),
          z.object({ method: z.literal("paypal"), email: z.string() }),
        ])
        .optional(),
    });
    renderHook(() => {
      const form = useForm(optionalSchema, { initialValues: {} });
      // @ts-expect-error the discriminant is common — rejected even optional
      useVariantField(form, "payment", "method");
      // @ts-expect-error not a variant field
      useVariantField(form, "payment", "nope");
      // a real variant field is still accepted and typed
      const cardNumber = useVariantField(form, "payment", "cardNumber");
      expectTypeOf(cardNumber.value).toEqualTypeOf<string | undefined>();
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

  it("explicit type arguments on a schema-typed form are a readable compile error", () => {
    renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          amount: 0,
          payment: { method: "card", cardNumber: "" },
        },
      });
      // The trap-guard overload blames the UNION PATH argument with
      // instructions — the first reported overload error reads:
      //   Argument of type '"payment"' is not assignable to parameter of
      //   type '"Remove the explicit type argument: a schema-typed form
      //   infers the variant value from the union path and field"'.
      // (Not the old baffling `schema?: undefined` brand mismatch.)
      // @ts-expect-error — explicit generics on a Form select the trap-guard
      useVariantField<string>(form, "payment", "cardNumber");
      // @ts-expect-error — an object-shaped explicit argument is the same trap
      useVariantField<{ cardNumber: string }>(form, "payment", "cardNumber");
      return null;
    });
  });

  it("inferred calls are unaffected by the trap-guard (sentinel never inferred)", () => {
    const { result } = setup();
    // The guard's TValue has no inference site, so a plain call falls
    // through to the typed overload and keeps full inference.
    expectTypeOf(result.current.cardNumber.value).toEqualTypeOf<
      string | undefined
    >();
    expect(result.current.cardNumber.path).toBe("payment.cardNumber");
  });

  it("explicit instantiation expressions keep their arity (D last, defaulted)", () => {
    // The three-type-arg form (schema, unionPath, field) that existed before
    // the guard must keep compiling — the guard overload has ONE type
    // parameter, so a three-arg instantiation never matches it.
    type ThreeArg = ReturnType<
      typeof useVariantField<typeof schema, "payment", "cardNumber">
    >;
    expectTypeOf<ThreeArg["value"]>().toEqualTypeOf<string | undefined>();
  });

  it("D recovery: a pathDepth-widened form still binds variant fields", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          amount: 0,
          payment: { method: "card", cardNumber: "42" },
        },
        pathDepth: 12,
      });
      return useVariantField(form, "payment", "cardNumber");
    });
    expectTypeOf(result.current.value).toEqualTypeOf<string | undefined>();
    expect(result.current.value).toBe("42");
  });

  it("a schema-less FieldFormApi keeps the explicit value type", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          amount: 0,
          payment: { method: "card", cardNumber: "4242" },
        },
      });
      // The documented escape hatch for dynamic/untyped binding sites.
      const bare: FieldFormApi = form;
      return useVariantField<string>(bare, "payment", "cardNumber");
    });
    expectTypeOf(result.current.value).toEqualTypeOf<string | undefined>();
    expect(result.current.value).toBe("4242");
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
