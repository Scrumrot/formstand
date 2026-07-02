import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useFormSelectorShallow } from "../../src/react/useFormState";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

describe("useFormSelectorShallow", () => {
  it("supports object-returning selectors without snapshot churn", () => {
    const renders: number[] = [];
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "Tim", age: 30 },
      });
      const slice = useFormSelectorShallow(form, (s) => ({
        name: s.values.name,
        touchedName: s.touched["name"] ?? false,
      }));
      renders.push(1);
      return { form, slice };
    });

    expect(result.current.slice).toEqual({ name: "Tim", touchedName: false });
    const before = renders.length;

    // A store change outside the slice must not re-render.
    act(() => {
      result.current.form.setValue("age", 31);
    });
    expect(renders.length).toBe(before);

    // A change inside the slice re-renders with the new value.
    act(() => {
      result.current.form.setValue("name", "Anna");
    });
    expect(renders.length).toBe(before + 1);
    expect(result.current.slice.name).toBe("Anna");
  });

  it("returns a shallow-stable reference while the slice is unchanged", () => {
    const { result, rerender } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "Tim", age: 30 },
      });
      return {
        form,
        slice: useFormSelectorShallow(form, (s) => ({ name: s.values.name })),
      };
    });
    const first = result.current.slice;
    rerender();
    expect(result.current.slice).toBe(first);
  });
});
