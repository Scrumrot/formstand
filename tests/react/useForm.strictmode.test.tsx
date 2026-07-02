import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

const schema = z.object({ name: z.string().min(2, "too short") });

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>{children}</StrictMode>
);

describe("useForm under StrictMode", () => {
  it("keeps a single form instance across double-rendering and rerenders", () => {
    const instances = new Set<unknown>();
    const { result, rerender } = renderHook(
      () => {
        const form = useForm(schema, { initialValues: { name: "" } });
        instances.add(form);
        return form;
      },
      { wrapper },
    );
    rerender();
    rerender();
    expect(instances.size).toBe(1);
    expect(result.current.getState().values).toEqual({ name: "" });
  });

  it("useField interactions behave normally under StrictMode", () => {
    const { result } = renderHook(
      () => {
        const form = useForm(schema, {
          initialValues: { name: "" },
          mode: "onChange",
        });
        return { form, field: useField(form, "name") };
      },
      { wrapper },
    );

    act(() => {
      result.current.field.setValue("x");
    });
    expect(result.current.field.value).toBe("x");
    expect(result.current.field.error).toEqual(["too short"]);
    expect(result.current.field.dirty).toBe(true);

    act(() => {
      result.current.field.setValue("long enough");
    });
    expect(result.current.field.error).toBeUndefined();
  });

  it("validateOnMount validates once and surfaces errors", () => {
    const { result } = renderHook(
      () =>
        useForm(schema, {
          initialValues: { name: "" },
          validateOnMount: true,
        }),
      { wrapper },
    );
    expect(result.current.getState().errors["name"]).toEqual(["too short"]);
  });
});
