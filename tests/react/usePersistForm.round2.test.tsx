import { act, render, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import type { PersistStorage } from "../../src/core/persist";
import { useFormValues } from "../../src/react/useFormValues";
import { usePersistForm } from "../../src/react/usePersistForm";

// Regression pins for the second November 2026 review: an inline storage
// object made usePersistForm resubscribe on every render and re-adopt the
// draft each time (wiping errors, and looping with useFormValues in the
// same component), and StrictMode's second mount re-adopted as well.

const KEY = "formstand:round2-hook";
const schema = z.object({ title: z.string(), body: z.string() });
const initialValues = { title: "", body: "" };

const backing = (): Map<string, string> =>
  new Map([[KEY, JSON.stringify({ title: "hello", body: "" })]]);

// A fresh storage object per call, the way an inline literal in a
// component body is fresh per render.
const inlineStorage = (map: Map<string, string>): PersistStorage => ({
  getItem: (key) => map.get(key) ?? null,
  setItem: (key, value) => {
    map.set(key, value);
  },
  removeItem: (key) => {
    map.delete(key);
  },
});

describe("usePersistForm with an inline storage object", () => {
  it("applies the draft once and keeps later state across re-renders", () => {
    const form = createForm(schema, { initialValues });
    const map = backing();
    const adopts = vi.fn();
    form.watchValues(adopts);
    const renders = { count: 0 };
    const Probe = () => {
      renders.count += 1;
      useFormValues(form);
      usePersistForm(form, {
        key: KEY,
        storage: inlineStorage(map),
        debounceMs: 0,
      });
      return null;
    };
    render(<Probe />);
    expect(form.getState().values.title).toBe("hello");
    expect(adopts).toHaveBeenCalledTimes(1);
    expect(renders.count).toBeLessThan(5);

    act(() => {
      form.setError("title", ["taken"]);
    });
    expect(form.getState().errors.title).toEqual(["taken"]);
    expect(adopts).toHaveBeenCalledTimes(1);
  });

  it("adopts once under StrictMode", () => {
    const form = createForm(schema, { initialValues });
    const map = backing();
    const adopts = vi.fn();
    form.watchValues(adopts);
    renderHook(
      () =>
        usePersistForm(form, {
          key: KEY,
          storage: inlineStorage(map),
          debounceMs: 0,
        }),
      { wrapper: StrictMode },
    );
    expect(form.getState().values.title).toBe("hello");
    expect(adopts).toHaveBeenCalledTimes(1);
  });
});
