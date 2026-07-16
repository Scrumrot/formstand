import { act, renderHook } from "@testing-library/react";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

const schema = z.object({ name: z.string() });

// useField.triggerValidate calls form.validateField directly — the
// FieldFormApi contract is that validateField RETURNS a FieldValidationResult
// ({ kind: "pending" } for async schemas, never a throw), matching what
// formstand's own createForm does. A custom implementation that throws is
// violating the contract, so the error propagates to the caller unswallowed.
describe("useField custom-form validate contract", () => {
  it("propagates a validation error from a custom form", () => {
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
