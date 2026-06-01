import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";
import { useFormState } from "../../src/react/useFormState";

const schema = z.object({
  name: z.string().min(2),
  age: z.number().int().nonnegative(),
  address: z.object({ city: z.string().min(1) }),
});

const useTestForm = () =>
  useForm(schema, {
    initialValues: { name: "Tim", age: 30, address: { city: "NYC" } },
  });

describe("useForm", () => {
  it("returns a stable Form instance across renders", () => {
    const { result, rerender } = renderHook(() => useTestForm());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("exposes the schema", () => {
    const { result } = renderHook(() => useTestForm());
    expect(result.current.schema).toBe(schema);
  });
});

describe("useFormState", () => {
  it("returns the selected slice and re-renders only when it changes", () => {
    const renders: string[] = [];
    const { result } = renderHook(() => {
      const form = useTestForm();
      const name = useFormState(form, (s) => s.values.name);
      renders.push(name);
      return { form, name };
    });

    expect(result.current.name).toBe("Tim");
    const renderCountBefore = renders.length;

    act(() => {
      result.current.form.setValue("age", 31);
    });
    expect(renders.length).toBe(renderCountBefore);

    act(() => {
      result.current.form.setValue("name", "Jane");
    });
    expect(result.current.name).toBe("Jane");
    expect(renders.length).toBe(renderCountBefore + 1);
  });
});

describe("useField", () => {
  it("reads value, error, touched, dirty for the given path", () => {
    const { result } = renderHook(() => {
      const form = useTestForm();
      const name = useField<string>(form, "name");
      return { form, name };
    });

    expect(result.current.name.value).toBe("Tim");
    expect(result.current.name.error).toBeUndefined();
    expect(result.current.name.touched).toBe(false);
    expect(result.current.name.dirty).toBe(false);
  });

  it("setValue updates the field value", () => {
    const { result } = renderHook(() => {
      const form = useTestForm();
      return { form, name: useField<string>(form, "name") };
    });

    act(() => {
      result.current.name.setValue("Jane");
    });
    expect(result.current.name.value).toBe("Jane");
    expect(result.current.name.dirty).toBe(true);
  });

  it("onBlur marks touched and runs field validation", () => {
    const { result } = renderHook(() => {
      const form = useTestForm();
      return { form, name: useField<string>(form, "name") };
    });

    act(() => {
      result.current.name.setValue("x");
    });
    expect(result.current.name.error).toBeUndefined();

    act(() => {
      result.current.name.onBlur();
    });
    expect(result.current.name.touched).toBe(true);
    expect(result.current.name.error).toBeDefined();
  });

  it("reads nested paths", () => {
    const { result } = renderHook(() => {
      const form = useTestForm();
      return { form, city: useField<string>(form, "address.city") };
    });

    expect(result.current.city.value).toBe("NYC");

    act(() => {
      result.current.city.setValue("Boston");
    });
    expect(result.current.city.value).toBe("Boston");
  });

  it("returns a stable object when its own slice has not changed", () => {
    const { result } = renderHook(() => {
      const form = useTestForm();
      const name = useField<string>(form, "name");
      const age = useField<number>(form, "age");
      return { form, name, age };
    });

    const nameBefore = result.current.name;
    act(() => {
      result.current.form.setValue("age", 99);
    });
    expect(result.current.age.value).toBe(99);
    expect(result.current.name).toBe(nameBefore);
  });
});
