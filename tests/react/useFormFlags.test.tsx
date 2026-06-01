import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useForm } from "../../src/react/useForm";
import {
  useIsDirty,
  useIsSubmitting,
  useIsValid,
  useSubmitCount,
} from "../../src/react/useFormFlags";

const schema = z.object({
  name: z.string().min(2),
  age: z.number(),
});

describe("useIsDirty", () => {
  it("is false initially and becomes true after a setValue", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { name: "Tim", age: 30 } });
      return { form, dirty: useIsDirty(form) };
    });
    expect(result.current.dirty).toBe(false);
    act(() => {
      result.current.form.setValue("name", "Jane");
    });
    expect(result.current.dirty).toBe(true);
  });
});

describe("useIsValid", () => {
  it("is true initially and becomes false after writing an error", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { name: "Tim", age: 30 } });
      return { form, valid: useIsValid(form) };
    });
    expect(result.current.valid).toBe(true);
    act(() => {
      result.current.form.setError("name", ["bad"]);
    });
    expect(result.current.valid).toBe(false);
    act(() => {
      result.current.form.clearErrors();
    });
    expect(result.current.valid).toBe(true);
  });
});

describe("useIsSubmitting + useSubmitCount", () => {
  it("track submit lifecycle", async () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { name: "Tim", age: 30 } });
      return {
        form,
        isSubmitting: useIsSubmitting(form),
        count: useSubmitCount(form),
      };
    });
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.count).toBe(0);
    await act(async () => {
      await result.current.form.submit(() => {});
    });
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.count).toBe(1);
  });
});
