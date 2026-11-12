import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

// useField's change and blur triggers start a validation pass nobody
// awaits. When the schema's async refinement throws (a failed fetch), that
// pass must release the field's in-flight flag and report the error,
// rather than strand the flag and escape as an unhandled rejection.

// Throws for one value only: the first sync-entry validation runs the
// refinement through zod's sync parse, whose promise zod discards, so the
// scope is latched on a benign value first (see the core test's note).
const exploding = z.object({
  username: z.string().refine(
    async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (value === "boom") throw new Error("lookup failed");
      return true;
    },
    { message: "n/a" },
  ),
});

const settle = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe("useField with a throwing async refinement", () => {
  const error = vi.spyOn(console, "error");
  beforeEach(() => {
    error.mockImplementation(() => {});
    error.mockClear();
  });
  afterEach(() => {
    error.mockReset();
  });

  it("the change trigger releases the flag and reports the error", async () => {
    const { result } = renderHook(() => {
      const form = useForm(exploding, {
        initialValues: { username: "ada" },
        mode: "onChange",
      });
      return { form, username: useField(form, "username") };
    });
    act(() => {
      result.current.username.setValue("grace");
    });
    await settle(25);
    expect(error).not.toHaveBeenCalled();
    act(() => {
      result.current.username.setValue("boom");
    });
    expect(result.current.username.isValidating).toBe(true);
    await settle(25);
    expect(result.current.username.isValidating).toBe(false);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("[formstand]"),
      expect.any(Error),
    );
  });

  it("the debounced trigger does the same", async () => {
    const { result } = renderHook(() => {
      const form = useForm(exploding, {
        initialValues: { username: "ada" },
        mode: "onChange",
      });
      return {
        form,
        username: useField(form, "username", { debounceMs: 5 }),
      };
    });
    act(() => {
      result.current.username.setValue("boom");
    });
    await settle(40);
    expect(result.current.username.isValidating).toBe(false);
    expect(result.current.form.getState().isValidating).toEqual({});
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("[formstand]"),
      expect.any(Error),
    );
  });
});
