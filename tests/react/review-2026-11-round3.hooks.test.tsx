import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import type { PersistStorage } from "../../src/core/persist";
import { dateToInputText } from "../../src/react/inputProps";
import { useFormSteps } from "../../src/react/useFormSteps";
import { useFormValues } from "../../src/react/useFormValues";
import { usePersistForm } from "../../src/react/usePersistForm";

// Regression pins for the third November 2026 review, hooks half: the
// wizard reading the step it is on at call time, usePersistForm keeping
// its debounce under an inline storage object, and dateToInputText on a
// date-shaped string that spells no day.

describe("useFormSteps reads the live step", () => {
  const schema = z.object({ a: z.string(), b: z.string(), c: z.string() });
  const STEPS = [{ fields: ["a"] }, { fields: ["b"] }, { fields: ["c"] }] as const;
  const make = () => createForm(schema, { initialValues: { a: "1", b: "2", c: "3" } });

  it("two awaited next() calls from one closure advance twice", async () => {
    const { result } = renderHook(() => useFormSteps(make(), STEPS));
    const wizard = result.current;
    const outcome: boolean[] = [];
    await act(async () => {
      outcome.push(await wizard.next());
      outcome.push(await wizard.next());
    });
    expect(outcome).toEqual([true, true]);
    expect(result.current.step).toBe(2);
    expect(result.current.steps.map((s) => s.visited)).toEqual([true, true, true]);
  });

  it("goTo() after next() from the same closure walks from the live step", async () => {
    const { result } = renderHook(() => useFormSteps(make(), STEPS));
    const wizard = result.current;
    const landed = await act(async () => {
      await wizard.next();
      return wizard.goTo(2);
    });
    expect(landed).toBe(2);
    expect(result.current.step).toBe(2);
  });

  it("back() pressed during an in-flight next() wins", async () => {
    const { result } = renderHook(() => useFormSteps(make(), STEPS));
    await act(() => result.current.goTo(1));
    expect(result.current.step).toBe(1);
    const wizard = result.current;
    const outcome = await act(async () => {
      const pending = wizard.next();
      wizard.back();
      return pending;
    });
    expect(outcome).toBe(false);
    expect(result.current.step).toBe(0);
  });

  it("keeps next, back and goTo reference-stable across navigation", async () => {
    const form = make();
    const { result } = renderHook(() => useFormSteps(form, STEPS));
    const before = result.current;
    await act(() => before.next());
    expect(result.current.step).toBe(1);
    expect(result.current.next).toBe(before.next);
    expect(result.current.back).toBe(before.back);
    expect(result.current.goTo).toBe(before.goTo);
  });
});

describe("usePersistForm with an inline storage object", () => {
  const schema = z.object({ title: z.string() });
  const KEY = "formstand:round3-hook";

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const backed = (map: Map<string, string>, setItem: PersistStorage["setItem"]): PersistStorage => ({
    getItem: (k) => map.get(k) ?? null,
    setItem,
    removeItem: (k) => void map.delete(k),
  });

  it("keeps the debounce and reads the draft once", () => {
    const form = createForm(schema, { initialValues: { title: "" } });
    const map = new Map<string, string>([[KEY, JSON.stringify({ title: "hello" })]]);
    const setItem = vi.fn((k: string, v: string) => void map.set(k, v));
    const getItem = vi.fn((k: string) => map.get(k) ?? null);
    const Probe = () => {
      useFormValues(form);
      usePersistForm(form, {
        key: KEY,
        storage: { ...backed(map, setItem), getItem },
        debounceMs: 300,
      });
      return null;
    };
    render(<Probe />);
    expect(form.getState().values.title).toBe("hello");
    const reads = getItem.mock.calls.length;
    act(() => form.setValue("title", "a"));
    act(() => form.setValue("title", "ab"));
    act(() => form.setValue("title", "abc"));
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem.mock.calls.length).toBe(reads);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(map.get(KEY) ?? "null")).toEqual({ title: "abc" });
  });

  it("a storage swap takes effect on the next touch", () => {
    const form = createForm(schema, { initialValues: { title: "" } });
    const first = new Map<string, string>();
    const second = new Map<string, string>();
    const setFirst = vi.fn((k: string, v: string) => void first.set(k, v));
    const setSecond = vi.fn((k: string, v: string) => void second.set(k, v));
    const { rerender } = renderHook(
      ({ storage }: { storage: PersistStorage }) =>
        usePersistForm(form, { key: KEY, storage, debounceMs: 0 }),
      { initialProps: { storage: backed(first, setFirst) } },
    );
    act(() => form.setValue("title", "one"));
    expect(setFirst).toHaveBeenCalledTimes(1);
    rerender({ storage: backed(second, setSecond) });
    act(() => form.setValue("title", "two"));
    expect(setFirst).toHaveBeenCalledTimes(1);
    expect(setSecond).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second.get(KEY) ?? "null")).toEqual({ title: "two" });
  });
});

describe("dateToInputText on a date-shaped string that spells no day", () => {
  it("renders empty instead of the Date constructor's reading", () => {
    expect(dateToInputText("2026-02-31" as unknown as Date)).toBe("");
    expect(dateToInputText("2026-03-01" as unknown as Date)).toBe("2026-03-01");
    expect(dateToInputText("2026-03-01T12:00:00.000Z" as unknown as Date)).toBe(
      dateToInputText(new Date("2026-03-01T12:00:00.000Z")),
    );
  });
});
