import { act, renderHook } from "@testing-library/react";
import { useMemo } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

const schema = z.object({ name: z.string() });

// useField.triggerValidate wraps form.validateField in a try/catch: a form
// whose SYNC validate throws zod's async-required signal escalates to async
// validation; any other error propagates. formstand's own createForm handles
// async-required internally (validateField returns a "pending" result rather
// than throwing), so these two branches are only reachable through a custom
// FieldFormApi — the documented extension point. A spread override pins the
// contract.
describe("useField custom-form validate contract", () => {
  // zod's async-during-sync signal is matched by message (dual-package safe).
  const asyncRequired = new Error(
    "Encountered Promise during synchronous parse",
  );

  it("escalates a sync async-required error to validateFieldAsync", () => {
    const validateFieldAsync = vi.fn(() => Promise.resolve(true));
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "ok" },
        mode: "onChange",
      });
      const custom = useMemo(
        () =>
          ({
            ...form,
            validateField: () => {
              throw asyncRequired;
            },
            validateFieldAsync,
          }) as unknown as typeof form,
        [form],
      );
      return useField(custom, "name");
    });

    act(() => {
      result.current.setValue("changed");
    });
    expect(validateFieldAsync).toHaveBeenCalledWith("name");
  });

  it("rethrows a non-async validation error", () => {
    const boom = new Error("boom");
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "ok" },
        mode: "onChange",
      });
      const custom = useMemo(
        () =>
          ({
            ...form,
            validateField: () => {
              throw boom;
            },
          }) as unknown as typeof form,
        [form],
      );
      return useField(custom, "name");
    });

    expect(() =>
      act(() => {
        result.current.setValue("changed");
      }),
    ).toThrow("boom");
  });

  it("setTouched and validateAsync forward to the form", async () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { name: "ok" } });
      return useField(form, "name");
    });

    act(() => {
      result.current.setTouched(true);
    });
    expect(result.current.touched).toBe(true);

    await act(async () => {
      await result.current.validateAsync();
    });
    expect(result.current.error).toBeUndefined();
  });
});
