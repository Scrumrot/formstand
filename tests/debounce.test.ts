import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncer } from "../src/core/debounce";

// The shared trailing-edge debouncer behind persistForm's draft writes and
// useField's validation debounce: a reschedule replaces the pending run,
// cancel drops it, and 0 runs synchronously (the callers' "no debounce").

describe("createDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the LAST scheduled run once the delay elapses", () => {
    const debouncer = createDebouncer(50);
    const calls: string[] = [];
    debouncer.schedule(() => calls.push("first"));
    debouncer.schedule(() => calls.push("second"));
    expect(debouncer.pending()).toBe(true);
    vi.advanceTimersByTime(49);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["second"]);
    expect(debouncer.pending()).toBe(false);
  });

  it("cancel drops the pending run", () => {
    const debouncer = createDebouncer(50);
    const calls: string[] = [];
    debouncer.schedule(() => calls.push("run"));
    debouncer.cancel();
    expect(debouncer.pending()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(calls).toEqual([]);
  });

  it("a delay of 0 runs synchronously and leaves nothing pending", () => {
    const debouncer = createDebouncer(0);
    const calls: string[] = [];
    debouncer.schedule(() => calls.push("now"));
    expect(calls).toEqual(["now"]);
    expect(debouncer.pending()).toBe(false);
  });

  it("scheduling again after a fire starts a fresh window", () => {
    const debouncer = createDebouncer(10);
    const calls: number[] = [];
    debouncer.schedule(() => calls.push(1));
    vi.advanceTimersByTime(10);
    debouncer.schedule(() => calls.push(2));
    vi.advanceTimersByTime(10);
    expect(calls).toEqual([1, 2]);
  });
});
