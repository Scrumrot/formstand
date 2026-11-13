import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { type PersistStorage, persistForm } from "../src/core/persist";

// Regression pins for the second November 2026 review, persistence half:
// the gap fill's reach (nullable keys, unions, records), a manual load()
// that wrote its own draft back, the auto-apply of a draft the form
// already holds, and validateOnMount judging an adopted draft.

const KEY = "formstand:round2-draft";

const memoryStorage = (): PersistStorage & {
  readonly map: Map<string, string>;
  readonly writes: () => number;
} => {
  const map = new Map<string, string>();
  const counter = { count: 0 };
  return {
    map,
    writes: () => counter.count,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      counter.count += 1;
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("fillRequiredGaps reach", () => {
  it("fills a nullable-but-required key the draft lacks", () => {
    const schema = z.object({
      title: z.string(),
      note: z.string().nullable(),
    });
    const form = createForm(schema, {
      initialValues: { title: "", note: null },
    });
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ title: "x" }));
    persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual({ title: "x", note: null });
  });

  it("leaves an optional-and-nullable key absent", () => {
    const schema = z.object({
      title: z.string(),
      note: z.string().nullable().optional(),
    });
    const form = createForm(schema, {
      initialValues: { title: "", note: null },
    });
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ title: "x" }));
    persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual({ title: "x" });
  });

  it("does not splice one variant's key into another under a union", () => {
    const schema = z.object({
      pay: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("card"), number: z.string() }),
        z.object({ kind: z.literal("cash"), tendered: z.number() }),
      ]),
    });
    const form = createForm(schema, {
      initialValues: { pay: { kind: "card", number: "" } },
    });
    const storage = memoryStorage();
    storage.map.set(
      KEY,
      JSON.stringify({ pay: { kind: "cash", tendered: 5 } }),
    );
    persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual({
      pay: { kind: "cash", tendered: 5 },
    });
  });

  it("does not resurrect a record key the draft removed", () => {
    const schema = z.object({ tags: z.record(z.string(), z.string()) });
    const form = createForm(schema, {
      initialValues: { tags: { a: "1", b: "2" } },
    });
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ tags: { a: "1" } }));
    persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual({ tags: { a: "1" } });
  });

  it("still fills a required key under a nested object", () => {
    const schema = z.object({
      profile: z.object({ name: z.string(), bio: z.string() }),
    });
    const form = createForm(schema, {
      initialValues: { profile: { name: "", bio: "" } },
    });
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ profile: { name: "tim" } }));
    persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual({
      profile: { name: "tim", bio: "" },
    });
  });
});

describe("load() and the auto-apply", () => {
  const schema = z.object({ title: z.string(), body: z.string() });
  const initialValues = { title: "", body: "" };

  it("a manual load() does not write the draft it just read back", () => {
    const form = createForm(schema, { initialValues });
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ title: "hello", body: "" }));
    const handle = persistForm(form, {
      key: KEY,
      storage,
      apply: "manual",
      debounceMs: 0,
    });
    expect(handle.load()).toBe(true);
    vi.runAllTimers();
    expect(storage.writes()).toBe(0);
    expect(form.getState().values.title).toBe("hello");
    // The next real edit still persists.
    form.setValue("title", "hello again");
    expect(storage.writes()).toBe(1);
  });

  it("skips the auto-apply of a draft the form already holds", () => {
    const form = createForm(schema, { initialValues });
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ title: "hello", body: "" }));
    const first = persistForm(form, { key: KEY, storage, debounceMs: 0 });
    expect(form.getState().values.title).toBe("hello");
    form.setError("title", ["taken"]);
    first.dispose();
    // A resubscribe (what usePersistForm does when its deps change) finds
    // the same draft and leaves the form alone: no rebase, errors intact.
    persistForm(form, { key: KEY, storage, debounceMs: 0 });
    expect(form.getState().errors.title).toEqual(["taken"]);
    expect(form.getState().values.title).toBe("hello");
  });

  it("a caller's load() still applies a draft equal to the values", () => {
    const form = createForm(schema, { initialValues: { title: "hello", body: "" } });
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ title: "hello", body: "" }));
    const handle = persistForm(form, { key: KEY, storage, apply: "manual" });
    form.setValue("title", "edited");
    form.setValue("title", "hello");
    expect(form.getState().errors).toEqual({});
    form.setError("title", ["taken"]);
    expect(handle.load()).toBe(true);
    // adopt semantics: the rebase clears the channel, as documented.
    expect(form.getState().errors).toEqual({});
  });

  it("an adopted draft is judged when the form validates on mount", () => {
    const strict = z.object({ title: z.string().min(1, "required") });
    const form = createForm(strict, {
      initialValues: { title: "ok" },
      validateOnMount: true,
    });
    expect(form.getState().errors).toEqual({});
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ title: "" }));
    persistForm(form, { key: KEY, storage });
    expect(form.getState().values.title).toBe("");
    expect(form.getState().errors.title).toEqual(["required"]);
  });
});
