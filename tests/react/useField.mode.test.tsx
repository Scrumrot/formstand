import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

const schema = z.object({ name: z.string().min(2) });

describe("useField + validation mode", () => {
  it("default (onBlur) validates on blur but not on change", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { name: "ok" } });
      return { form, name: useField(form, "name") };
    });

    act(() => {
      result.current.name.setValue("x");
    });
    expect(result.current.name.error).toBeUndefined();

    act(() => {
      result.current.name.onBlur();
    });
    expect(result.current.name.error).toBeDefined();
  });

  it("mode=onChange validates on every change", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "ok" },
        mode: "onChange",
      });
      return { form, name: useField(form, "name") };
    });

    act(() => {
      result.current.name.setValue("x");
    });
    expect(result.current.name.error).toBeDefined();
  });

  it("mode=onSubmit does not validate on change or blur until submit", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "ok" },
        mode: "onSubmit",
      });
      return { form, name: useField(form, "name") };
    });

    act(() => {
      result.current.name.setValue("x");
    });
    expect(result.current.name.error).toBeUndefined();

    act(() => {
      result.current.name.onBlur();
    });
    expect(result.current.name.error).toBeUndefined();
  });

  it("after a failed submit, reValidateMode (default onChange) kicks in", async () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "x" },
        mode: "onSubmit",
      });
      return { form, name: useField(form, "name") };
    });

    await act(async () => {
      await result.current.form.submit(() => {});
    });
    expect(result.current.name.error).toBeDefined();

    act(() => {
      result.current.name.setValue("ok");
    });
    expect(result.current.name.error).toBeUndefined();
  });

  it("a no-op setValue skips revalidation too (full no-op semantics)", () => {
    // The identity guard leaves the store state untouched, and the hook's
    // change-trigger gate is skipped with it: nothing changed, so the
    // current error state already reflects this value. Here the field
    // holds an INVALID value whose error has not been surfaced yet —
    // rewriting the same value must not surface it.
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "x" },
        mode: "onChange",
      });
      return { form, name: useField(form, "name") };
    });

    act(() => {
      result.current.name.setValue("x");
    });
    expect(result.current.name.error).toBeUndefined();

    // A real change through the same gate still validates immediately.
    act(() => {
      result.current.name.setValue("y");
    });
    expect(result.current.name.error).toBeDefined();
  });
});
