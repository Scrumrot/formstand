import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

const refineCalls: string[] = [];

const asyncSchema = z.object({
  username: z.string().refine(
    async (v) => {
      refineCalls.push(v);
      await new Promise((r) => setTimeout(r, 5));
      return v !== "taken";
    },
    { message: "taken" },
  ),
});

describe("useField with debounceMs option", () => {
  beforeEach(() => {
    refineCalls.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces validation so only the latest value's check runs", async () => {
    const { result } = renderHook(() => {
      const form = useForm(asyncSchema, {
        initialValues: { username: "ok" },
        mode: "onChange",
      });
      return {
        form,
        u: useField(form, "username", { debounceMs: 50 }),
      };
    });

    act(() => {
      result.current.u.setValue("ta");
      result.current.u.setValue("tak");
      result.current.u.setValue("taken");
    });
    expect(result.current.u.value).toBe("taken");
    expect(result.current.u.error).toBeUndefined();

    // Nothing fires until the debounce window elapses.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(49);
    });
    expect(refineCalls).toEqual([]);

    // The single trailing validation runs with the latest value.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(refineCalls).toEqual(["taken"]);
    expect(result.current.u.error).toEqual(["taken"]);
  });

  it("keystrokes inside the window reset the timer", async () => {
    const { result } = renderHook(() => {
      const form = useForm(asyncSchema, {
        initialValues: { username: "ok" },
        mode: "onChange",
      });
      return { form, u: useField(form, "username", { debounceMs: 50 }) };
    });

    act(() => {
      result.current.u.setValue("t");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    act(() => {
      result.current.u.setValue("ta");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    // 60ms elapsed total but only 30ms since the last keystroke.
    expect(refineCalls).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(refineCalls).toEqual(["ta"]);
  });
});
