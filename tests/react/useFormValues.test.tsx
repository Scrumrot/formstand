import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ReactNode } from "react";
import { z } from "zod";
import { createFormContext } from "../../src/react/FormContext";
import { useForm } from "../../src/react/useForm";
import type { FormStateApi } from "../../src/react/useFormSelector";
import { useFormValues } from "../../src/react/useFormValues";

const schema = z.object({
  name: z.string(),
  coords: z.object({ lat: z.number(), lng: z.number() }),
});

const initialValues = { name: "Tim", coords: { lat: 52.5, lng: 13.4 } };

describe("useFormValues", () => {
  it("returns the live values object, typed as z.input of the schema", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return { form, values: useFormValues(form) };
    });

    expectTypeOf(result.current.values).toEqualTypeOf<
      z.input<typeof schema>
    >();
    expect(result.current.values).toEqual(initialValues);

    act(() => {
      result.current.form.setValue("coords.lat", 48.1);
    });
    expect(result.current.values.coords.lat).toBe(48.1);
  });

  it("re-renders on setValue, not on unrelated state changes", () => {
    const renders: number[] = [];
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      const values = useFormValues(form);
      renders.push(1);
      return { form, values };
    });
    const before = renders.length;

    // touched and errors leave the values reference alone — no re-render.
    act(() => {
      result.current.form.setTouched("name", true);
      result.current.form.setError("name", "server said no");
    });
    expect(renders.length).toBe(before);

    // A value change replaces the values object — exactly one re-render.
    act(() => {
      result.current.form.setValue("name", "Anna");
    });
    expect(renders.length).toBe(before + 1);
    expect(result.current.values.name).toBe("Anna");
  });

  it("keeps a stable reference across unrelated re-renders", () => {
    const { result, rerender } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return useFormValues(form);
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("works through a form context and reads unknown on a structural form", () => {
    const ctx = createFormContext<typeof schema>();
    const wrapper = ({ children }: { children: ReactNode }) => {
      const form = useForm(schema, { initialValues });
      return <ctx.Provider form={form}>{children}</ctx.Provider>;
    };
    const { result } = renderHook(
      () => {
        const form = ctx.useFormContext();
        // Context preserves the Form type, so values stay fully typed...
        const typed = useFormValues(form);
        // ...while a structural (schema-less) view reads unknown.
        const structural: FormStateApi = form;
        const untyped = useFormValues(structural);
        return { typed, untyped };
      },
      { wrapper },
    );

    expectTypeOf(result.current.typed).toEqualTypeOf<
      z.input<typeof schema>
    >();
    expectTypeOf(result.current.untyped).toEqualTypeOf<unknown>();
    expect(result.current.typed).toEqual(initialValues);
    expect(result.current.untyped).toEqual(initialValues);
  });
});
