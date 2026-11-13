import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { type PersistStorage } from "../../src/core/persist";
import { usePersistForm } from "../../src/react/usePersistForm";

// usePersistForm forwards every storage call to the storage of the latest
// render: a swap from session to local storage (or to a per-user
// namespace) must move the writes, not keep feeding the first storage,
// and it must not cost a resubscribe (which flushed the debounce).

const memoryStorage = (): PersistStorage & {
  readonly map: Map<string, string>;
} => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

const schema = z.object({ title: z.string() });

describe("usePersistForm and a storage swap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves the writes to the new storage without resubscribing", () => {
    const form = createForm(schema, { initialValues: { title: "" } });
    const first = memoryStorage();
    const second = memoryStorage();
    const { rerender } = renderHook(
      ({ storage }) =>
        usePersistForm(form, { key: "draft", storage, debounceMs: 300 }),
      { initialProps: { storage: first } },
    );
    act(() => {
      form.setValue("title", "in the first storage");
      vi.advanceTimersByTime(300);
    });
    expect(JSON.parse(first.map.get("draft") ?? "null")).toEqual({
      title: "in the first storage",
    });
    // Every storage call goes to the storage of the latest render, so the
    // swap needs no resubscribe and the debounce window survives it.
    rerender({ storage: second });
    act(() => {
      form.setValue("title", "in the second storage");
      vi.advanceTimersByTime(300);
    });
    expect(JSON.parse(second.map.get("draft") ?? "null")).toEqual({
      title: "in the second storage",
    });
    expect(JSON.parse(first.map.get("draft") ?? "null")).toEqual({
      title: "in the first storage",
    });
    // A write pending at the swap lands in the storage in use when it fires.
    act(() => {
      form.setValue("title", "pending at swap");
    });
    rerender({ storage: first });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(JSON.parse(first.map.get("draft") ?? "null")).toEqual({
      title: "pending at swap",
    });
    expect(JSON.parse(second.map.get("draft") ?? "null")).toEqual({
      title: "in the second storage",
    });
  });
});
