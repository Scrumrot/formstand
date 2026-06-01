import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

const asyncSchema = z.object({
  username: z.string().min(2).refine(
    async (v) => {
      await new Promise((r) => setTimeout(r, 5));
      return v !== "taken";
    },
    { message: "taken" },
  ),
});

describe("useField with an async-refine schema", () => {
  it("onBlur does not throw and surfaces async errors", async () => {
    const { result } = renderHook(() => {
      const form = useForm(asyncSchema, { initialValues: { username: "taken" } });
      return { form, u: useField<string>(form, "username") };
    });

    act(() => {
      result.current.u.onBlur();
    });

    await waitFor(() => {
      expect(result.current.u.error).toEqual(["taken"]);
    });
  });

  it("setValue in onChange mode does not throw and surfaces async errors", async () => {
    const { result } = renderHook(() => {
      const form = useForm(asyncSchema, {
        initialValues: { username: "ok" },
        mode: "onChange",
      });
      return { form, u: useField<string>(form, "username") };
    });

    act(() => {
      result.current.u.setValue("taken");
    });

    await waitFor(() => {
      expect(result.current.u.error).toEqual(["taken"]);
    });
  });

  it("setError / clearError work on async-schema fields", () => {
    const { result } = renderHook(() => {
      const form = useForm(asyncSchema, { initialValues: { username: "ok" } });
      return { form, u: useField<string>(form, "username") };
    });

    act(() => {
      result.current.u.setError(["server says taken"]);
    });
    expect(result.current.u.error).toEqual(["server says taken"]);

    act(() => {
      result.current.u.clearError();
    });
    expect(result.current.u.error).toBeUndefined();
  });
});
