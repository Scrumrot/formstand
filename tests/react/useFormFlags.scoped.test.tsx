import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { useForm } from "../../src/react/useForm";
import { useIsDirty, useIsValid } from "../../src/react/useFormFlags";

const schema = z.object({
  shipping: z.object({
    city: z.string().min(1, "city required"),
    zip: z.string(),
  }),
  billing: z.object({ city: z.string() }),
  items: z.array(z.object({ name: z.string().min(1) })).min(1, "one item"),
});

const initialValues = {
  shipping: { city: "NYC", zip: "10001" },
  billing: { city: "NYC" },
  items: [{ name: "a" }],
};

const setup = () =>
  renderHook(() => {
    const form = useForm(schema, { initialValues });
    return {
      form,
      whole: useIsDirty(form),
      shipping: useIsDirty(form, "shipping"),
      billing: useIsDirty(form, "billing"),
      leaf: useIsDirty(form, "shipping.city"),
    };
  });

describe("useIsDirty(form, path)", () => {
  it("scopes dirtiness to the subtree with prefix semantics", () => {
    const { result } = setup();
    expect(result.current.whole).toBe(false);
    expect(result.current.shipping).toBe(false);

    act(() => {
      result.current.form.setValue("shipping.city", "LA");
    });
    expect(result.current.whole).toBe(true);
    expect(result.current.shipping).toBe(true);
    expect(result.current.leaf).toBe(true);
    expect(result.current.billing).toBe(false);

    act(() => {
      result.current.form.setValue("shipping.city", "NYC");
    });
    expect(result.current.whole).toBe(false);
    expect(result.current.shipping).toBe(false);
  });

  it("omitted path means whole-form (existing behavior)", () => {
    const { result } = setup();
    act(() => {
      result.current.form.setValue("billing.city", "SF");
    });
    expect(result.current.whole).toBe(true);
    expect(result.current.shipping).toBe(false);
  });

  it("rejects a typo'd path against the FieldPath union", () => {
    renderHook(() => {
      const form = useForm(schema, { initialValues });
      // @ts-expect-error "shippng" is not a path of the schema
      return useIsDirty(form, "shippng");
    });
  });
});

describe("useIsValid(form, path)", () => {
  it("scopes validity to errors at or under the path", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return {
        form,
        whole: useIsValid(form),
        shipping: useIsValid(form, "shipping"),
        billing: useIsValid(form, "billing"),
      };
    });
    expect(result.current.whole).toBe(true);

    act(() => {
      result.current.form.setValue("shipping.city", "");
      result.current.form.validateField("shipping.city");
    });
    expect(result.current.whole).toBe(false);
    expect(result.current.shipping).toBe(false);
    expect(result.current.billing).toBe(true);
  });

  it("the path's own key counts (array-level errors)", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return { form, items: useIsValid(form, "items") };
    });
    act(() => {
      result.current.form.setError("items", ["array-level problem"]);
    });
    expect(result.current.items).toBe(false);
  });

  it("scoping does not leak across sibling prefixes", () => {
    // "items" must not cover a hypothetical "itemsArchived" — isPathOrChild
    // splits on dots, not raw startsWith.
    const looseSchema = z.object({
      items: z.string(),
      itemsArchived: z.string(),
    });
    const { result } = renderHook(() => {
      const form = useForm(looseSchema, {
        initialValues: { items: "a", itemsArchived: "b" },
      });
      return { form, items: useIsValid(form, "items") };
    });
    act(() => {
      result.current.form.setError("itemsArchived", ["nope"]);
    });
    expect(result.current.items).toBe(true);
  });

  it("returns booleans (typed)", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return { d: useIsDirty(form, "shipping"), v: useIsValid(form, "items") };
    });
    expectTypeOf(result.current.d).toEqualTypeOf<boolean>();
    expectTypeOf(result.current.v).toEqualTypeOf<boolean>();
  });
});
