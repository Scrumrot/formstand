import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { type PersistStorage, persistForm } from "../src/core/persist";

const schema = z.object({
  title: z.string(),
  body: z.string(),
});

const initialValues = { title: "", body: "" };

const draft = { title: "draft title", body: "draft body" };

const KEY = "formstand:test-draft";

// In-memory PersistStorage stub — no jsdom localStorage dependence.
const memoryStorage = (): PersistStorage & { readonly map: Map<string, string> } => {
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

const makeForm = () => createForm(schema, { initialValues });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("persistForm", () => {
  it("writes the draft after the debounce, not before", () => {
    const storage = memoryStorage();
    const form = makeForm();
    persistForm(form, { key: KEY, storage, debounceMs: 300 });

    form.setValue("title", "hello");
    expect(storage.map.has(KEY)).toBe(false);

    vi.advanceTimersByTime(299);
    expect(storage.map.has(KEY)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(JSON.parse(storage.map.get(KEY) ?? "")).toEqual({
      title: "hello",
      body: "",
    });
  });

  it("debounces on the trailing edge — rapid edits produce one final write", () => {
    const storage = memoryStorage();
    const form = makeForm();
    persistForm(form, { key: KEY, storage, debounceMs: 300 });

    form.setValue("title", "a");
    vi.advanceTimersByTime(200);
    form.setValue("title", "ab");
    vi.advanceTimersByTime(200);
    expect(storage.map.has(KEY)).toBe(false);

    vi.advanceTimersByTime(100);
    expect(JSON.parse(storage.map.get(KEY) ?? "")).toEqual({
      title: "ab",
      body: "",
    });
  });

  it("debounceMs: 0 writes synchronously on every change", () => {
    const storage = memoryStorage();
    const form = makeForm();
    persistForm(form, { key: KEY, storage, debounceMs: 0 });

    form.setValue("title", "now");
    expect(JSON.parse(storage.map.get(KEY) ?? "")).toEqual({
      title: "now",
      body: "",
    });
  });

  it('applies an existing draft on create with "adopt" and the form reads CLEAN', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify(draft));
    const form = makeForm();
    persistForm(form, { key: KEY, storage });

    expect(form.getState().values).toEqual(draft);
    // adoptValues rebased the form: the draft IS the new baseline.
    expect(form.getState().initialValues).toEqual(draft);
    expect(form.dirtyFields()).toEqual([]);
  });

  it('apply: "restore" applies the draft but the form is DIRTY vs the original initials', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify(draft));
    const form = makeForm();
    persistForm(form, { key: KEY, storage, apply: "restore" });

    expect(form.getState().values).toEqual(draft);
    expect(form.getState().initialValues).toEqual(initialValues);
    expect(form.dirtyFields()).toEqual(["title", "body"]);
  });

  it('apply: "manual" never auto-applies; restore() returns true and applies', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify(draft));
    const form = makeForm();
    const handle = persistForm(form, { key: KEY, storage, apply: "manual" });

    expect(form.getState().values).toEqual(initialValues);

    expect(handle.restore()).toBe(true);
    expect(form.getState().values).toEqual(draft);
    // Manual restore applies with adopt semantics — the draft reads clean.
    expect(form.dirtyFields()).toEqual([]);
  });

  it("restore() returns false without a stored draft", () => {
    const storage = memoryStorage();
    const form = makeForm();
    const handle = persistForm(form, { key: KEY, storage, apply: "manual" });

    expect(handle.restore()).toBe(false);
    expect(form.getState().values).toEqual(initialValues);
  });

  it("corrupt JSON in storage: restore() is false and nothing throws", () => {
    const storage = memoryStorage();
    storage.setItem(KEY, "{not json!!!");
    const form = makeForm();
    // Auto-apply at create hits the corrupt draft too — must not throw.
    const handle = persistForm(form, { key: KEY, storage });

    expect(form.getState().values).toEqual(initialValues);
    expect(handle.restore()).toBe(false);
    expect(form.getState().values).toEqual(initialValues);
  });

  it("clear() cancels a pending debounced write (no stale draft re-written)", () => {
    const storage = memoryStorage();
    const form = makeForm();
    const handle = persistForm(form, { key: KEY, storage, debounceMs: 300 });

    form.setValue("title", "about to be cleared");
    handle.clear();
    vi.advanceTimersByTime(1000);

    expect(storage.map.size).toBe(0);
  });

  it("clear() deletes an already-written draft", () => {
    const storage = memoryStorage();
    const form = makeForm();
    const handle = persistForm(form, { key: KEY, storage, debounceMs: 0 });

    form.setValue("title", "saved");
    expect(storage.map.has(KEY)).toBe(true);

    handle.clear();
    expect(storage.map.has(KEY)).toBe(false);
  });

  it("dispose() stops future writes and cancels the pending one", () => {
    const storage = memoryStorage();
    const form = makeForm();
    const handle = persistForm(form, { key: KEY, storage, debounceMs: 300 });

    form.setValue("title", "pending at dispose");
    handle.dispose();
    vi.advanceTimersByTime(1000);
    expect(storage.map.size).toBe(0);

    form.setValue("title", "after dispose");
    vi.advanceTimersByTime(1000);
    expect(storage.map.size).toBe(0);
  });

  it("throwing storage skips persistence instead of throwing (private mode)", () => {
    const throwing: PersistStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const form = makeForm();
    const handle = persistForm(form, {
      key: KEY,
      storage: throwing,
      debounceMs: 0,
    });

    expect(handle.restore()).toBe(false);
    expect(() => form.setValue("title", "x")).not.toThrow();
    expect(() => handle.clear()).not.toThrow();
    handle.dispose();
  });

  it("applying the draft at create does not schedule a write-back", () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify(draft));
    const setItem = vi.spyOn(storage, "setItem");
    const form = makeForm();
    persistForm(form, { key: KEY, storage, debounceMs: 300 });

    vi.advanceTimersByTime(1000);
    expect(setItem).not.toHaveBeenCalled();
  });
});

// defaultStorage() is the fallback when no `storage` option is passed: it
// resolves globalThis.localStorage lazily and degrades to null (a no-op
// persist handle) when the environment lacks it or forbids access — SSR and
// privacy-mode safety. Exercised here because the default path skips the
// injected stub the tests above use.
describe("persistForm default storage fallback", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const restore = () => {
    if (original !== undefined) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  };
  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
  });

  it("degrades to a no-op when localStorage is undefined (e.g. SSR)", () => {
    vi.stubGlobal("localStorage", undefined);
    const form = makeForm();
    expect(() => {
      const handle = persistForm(form, { key: KEY, debounceMs: 300 });
      form.setValue("title", "hello");
      vi.advanceTimersByTime(300);
      handle.clear();
      handle.dispose();
    }).not.toThrow();
  });

  it("degrades to a no-op when localStorage access throws (privacy mode)", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: localStorage is not available");
      },
    });
    const form = makeForm();
    expect(() => {
      const handle = persistForm(form, { key: KEY, debounceMs: 300 });
      form.setValue("title", "hi");
      vi.advanceTimersByTime(300);
      handle.dispose();
    }).not.toThrow();
  });

  it("writes to the real localStorage when it is present", () => {
    // jsdom provides a working localStorage: the default path resolves and
    // uses it, no injected stub.
    globalThis.localStorage.removeItem(KEY);
    const form = makeForm();
    const handle = persistForm(form, { key: KEY, debounceMs: 300 });
    form.setValue("title", "persisted");
    vi.advanceTimersByTime(300);
    expect(globalThis.localStorage.getItem(KEY)).toContain("persisted");
    handle.clear();
    handle.dispose();
    globalThis.localStorage.removeItem(KEY);
  });
});
