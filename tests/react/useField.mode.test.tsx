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
      return { form, name: useField<string>(form, "name") };
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
      return { form, name: useField<string>(form, "name") };
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
      return { form, name: useField<string>(form, "name") };
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
      return { form, name: useField<string>(form, "name") };
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
});
