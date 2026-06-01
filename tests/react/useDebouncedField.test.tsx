import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useDebouncedField } from "../../src/react/useDebouncedField";
import { useForm } from "../../src/react/useForm";

const asyncSchema = z.object({
  username: z.string().refine(
    async (v) => {
      await new Promise((r) => setTimeout(r, 5));
      return v !== "taken";
    },
    { message: "taken" },
  ),
});

describe("useDebouncedField", () => {
  it("only fires async validation after the delay elapses on the latest value", async () => {
    const { result } = renderHook(() => {
      const form = useForm(asyncSchema, {
        initialValues: { username: "ok" },
        mode: "onChange",
      });
      return {
        form,
        u: useDebouncedField<string>(form, "username", { delayMs: 50 }),
      };
    });

    act(() => {
      result.current.u.setValue("ta");
      result.current.u.setValue("tak");
      result.current.u.setValue("taken");
    });
    expect(result.current.u.value).toBe("taken");
    expect(result.current.u.error).toBeUndefined();

    await waitFor(
      () => {
        expect(result.current.u.error).toEqual(["taken"]);
      },
      { timeout: 500 },
    );
  });
});
