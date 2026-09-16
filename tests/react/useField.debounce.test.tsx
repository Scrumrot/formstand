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

  it("clears a pending debounce timer on unmount (no late validation)", () => {
    const { result, unmount } = renderHook(() => {
      const form = useForm(asyncSchema, {
        initialValues: { username: "ok" },
        mode: "onChange",
      });
      return { u: useField(form, "username", { debounceMs: 50 }) };
    });

    act(() => {
      result.current.u.setValue("taken");
    });
    // Unmount with the timer still pending: the cleanup clears it, so the
    // trailing validation never runs after the component is gone.
    unmount();
    vi.advanceTimersByTime(200);
    expect(refineCalls).toEqual([]);
  });
});

// Regression (2026-09 library review, react #1): the pending debounce
// timer is invisible to the store, so reset() inside the window could not
// cancel it — the fire claimed a FRESH ownership token, read the
// post-reset values, and re-committed errors onto the pristine form
// ~debounceMs later. Two fire-time guards close it: a pristine form
// (values IS initialValues by reference) never receives a debounced
// commit, and a path whose value changed since scheduling is stale.
describe("debounced validation does not survive reset()", () => {
  beforeEach(() => {
    refineCalls.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const requiredSchema = z.object({
    name: z.string().min(1, "required"),
  });

  it("reset inside the debounce window leaves the pristine form clean", async () => {
    const { result } = renderHook(() => {
      const form = useForm(requiredSchema, {
        initialValues: { name: "" },
        mode: "onChange",
      });
      return { form, name: useField(form, "name", { debounceMs: 300 }) };
    });

    act(() => {
      result.current.name.setValue("a");
    });
    act(() => {
      // Invalid again — a debounced validation is now pending.
      result.current.name.setValue("");
    });
    act(() => {
      result.current.form.reset();
    });
    expect(result.current.form.getState().errors).toEqual({});

    await act(async () => {
      vi.advanceTimersByTime(400);
      await vi.runAllTimersAsync();
    });
    // The fire bailed: no error resurrected on the untouched form.
    expect(result.current.form.getState().errors).toEqual({});
  });

  it("an unrelated field's edit does not starve a pending validation", async () => {
    const twoField = z.object({
      name: z.string().min(1, "required"),
      other: z.string(),
    });
    const { result } = renderHook(() => {
      const form = useForm(twoField, {
        initialValues: { name: "x", other: "" },
        mode: "onChange",
      });
      return {
        form,
        name: useField(form, "name", { debounceMs: 300 }),
        other: useField(form, "other"),
      };
    });

    act(() => {
      result.current.name.setValue("");
    });
    act(() => {
      // A DIFFERENT path changes inside the window: the pending
      // validation's own value is untouched, so it must still run.
      result.current.other.setValue("edit");
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await vi.runAllTimersAsync();
    });
    expect(result.current.form.getState().errors["name"]).toEqual(["required"]);
  });
});
