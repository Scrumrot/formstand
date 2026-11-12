import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { type PersistStorage } from "../../src/core/persist";
import { usePersistForm } from "../../src/react/usePersistForm";

// usePersistForm resubscribes when the storage object changes, the way it
// does for the key: a swap from session to local storage (or to a per-user
// namespace) must move the writes, not keep feeding the first storage.

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

  it("moves the writes to the new storage and flushes the old subscription", () => {
    const form = createForm(schema, { initialValues: { title: "" } });
    const first = memoryStorage();
    const second = memoryStorage();
    const { result, rerender } = renderHook(
      ({ storage }) =>
        usePersistForm(form, { key: "draft", storage, debounceMs: 300 }),
      { initialProps: { storage: first } },
    );
    act(() => {
      form.setValue("title", "in the first storage");
    });
    // The swap disposes the first subscription, which flushes its pending
    // write, then the new one starts.
    rerender({ storage: second });
    expect(JSON.parse(first.map.get("draft") ?? "null")).toEqual({
      title: "in the first storage",
    });
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
    act(() => {
      result.current.flush();
    });
  });
});
