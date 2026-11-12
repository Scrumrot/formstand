import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { type PersistStorage, persistForm } from "../src/core/persist";

// Regression pins for the November 2026 review, persistence half: the
// after-submit clear()+reset() pair, dispose inside the debounce window,
// flush(), drafts older than a schema that gained a key, and the shape
// guard's reading of coerced scalars and union variants.

const KEY = "formstand:review-draft";

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

const stored = (storage: { readonly map: Map<string, string> }): unknown =>
  JSON.parse(storage.map.get(KEY) ?? "null");

const schema = z.object({ title: z.string(), body: z.string() });
const initialValues = { title: "", body: "" };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("clear() then a rebase", () => {
  it("reset() after clear() does not re-create the draft; the next edit does", () => {
    const storage = memoryStorage();
    const form = createForm(schema, { initialValues });
    const handle = persistForm(form, { key: KEY, storage, debounceMs: 300 });
    form.setValue("title", "work in progress");
    vi.advanceTimersByTime(300);
    expect(stored(storage)).toEqual({ title: "work in progress", body: "" });

    handle.clear();
    form.reset();
    vi.advanceTimersByTime(1000);
    expect(storage.map.size).toBe(0);

    form.adoptValues({ title: "from the server", body: "" });
    vi.advanceTimersByTime(1000);
    expect(storage.map.size).toBe(0);

    form.setValue("title", "a new draft");
    vi.advanceTimersByTime(300);
    expect(stored(storage)).toEqual({ title: "a new draft", body: "" });
  });

  it("a rebase without a preceding clear() still writes, as before", () => {
    const storage = memoryStorage();
    const form = createForm(schema, { initialValues });
    persistForm(form, { key: KEY, storage, debounceMs: 300 });
    form.adoptValues({ title: "from the server", body: "" });
    vi.advanceTimersByTime(300);
    expect(stored(storage)).toEqual({ title: "from the server", body: "" });
  });
});

describe("the debounce window at dispose and flush", () => {
  it("dispose() inside the window writes the last edits", () => {
    const storage = memoryStorage();
    const form = createForm(schema, { initialValues });
    const handle = persistForm(form, { key: KEY, storage, debounceMs: 300 });
    form.setValue("title", "typed just before unmount");
    vi.advanceTimersByTime(100);
    handle.dispose();
    expect(stored(storage)).toEqual({
      title: "typed just before unmount",
      body: "",
    });
  });

  it("clear() then dispose() leaves nothing behind", () => {
    const storage = memoryStorage();
    const form = createForm(schema, { initialValues });
    const handle = persistForm(form, { key: KEY, storage, debounceMs: 300 });
    form.setValue("title", "about to be discarded");
    handle.clear();
    handle.dispose();
    vi.advanceTimersByTime(1000);
    expect(storage.map.size).toBe(0);
  });

  it("flush() writes the pending draft now and is a no-op otherwise", () => {
    const storage = memoryStorage();
    const form = createForm(schema, { initialValues });
    const handle = persistForm(form, { key: KEY, storage, debounceMs: 300 });
    handle.flush();
    expect(storage.map.size).toBe(0);
    form.setValue("title", "flushed");
    handle.flush();
    expect(stored(storage)).toEqual({ title: "flushed", body: "" });
    vi.advanceTimersByTime(1000);
    expect(stored(storage)).toEqual({ title: "flushed", body: "" });
  });
});

describe("a draft older than a schema that gained a key", () => {
  const grown = z.object({
    title: z.string(),
    country: z.string().min(1, "pick a country"),
    nickname: z.string().optional(),
    profile: z.object({ name: z.string(), age: z.number() }),
    tags: z.array(z.string()),
  });
  const grownInitial = {
    title: "",
    country: "US",
    nickname: "bob",
    profile: { name: "", age: 18 },
    tags: ["a"],
  };

  it("fills required keys from the initial values, nested objects included", () => {
    const storage = memoryStorage();
    storage.map.set(
      KEY,
      JSON.stringify({ title: "old draft", profile: { name: "Ada" }, tags: [] }),
    );
    const form = createForm(grown, { initialValues: grownInitial });
    persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual({
      title: "old draft",
      country: "US",
      profile: { name: "Ada", age: 18 },
      tags: [],
    });
    // The rebase carries the fill too, so reset() keeps the default.
    form.setValue("country", "");
    form.reset();
    expect(form.getState().values.country).toBe("US");
  });

  it("leaves an optional key absent (a cleared optional looks the same)", () => {
    const storage = memoryStorage();
    storage.map.set(
      KEY,
      JSON.stringify({ title: "", country: "FR", profile: { name: "", age: 1 }, tags: [] }),
    );
    const form = createForm(grown, { initialValues: grownInitial });
    persistForm(form, { key: KEY, storage });
    expect(Object.hasOwn(form.getState().values, "nickname")).toBe(false);
  });

  it("a complete draft is applied untouched", () => {
    const storage = memoryStorage();
    const complete = {
      title: "t",
      country: "FR",
      nickname: "n",
      profile: { name: "Ada", age: 36 },
      tags: [],
    };
    storage.map.set(KEY, JSON.stringify(complete));
    const form = createForm(grown, { initialValues: grownInitial });
    persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual(complete);
  });
});

describe("the shape guard asks the schema about a kind mismatch", () => {
  const warn = vi.spyOn(console, "warn");
  beforeEach(() => {
    warn.mockImplementation(() => {});
    warn.mockClear();
  });
  afterEach(() => {
    warn.mockReset();
  });

  it("a coerced number behind a string initial value is a legitimate draft", () => {
    const coerced = z.object({ age: z.coerce.number().min(1) });
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ age: 42 }));
    const form = createForm(coerced, { initialValues: { age: "" } });
    const handle = persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual({ age: 42 });
    expect(handle.load()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("a union whose variants shape a key differently is a legitimate draft", () => {
    const union = z.object({
      shape: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("one"), details: z.object({ a: z.string() }) }),
        z.object({ kind: z.literal("many"), details: z.array(z.string()) }),
      ]),
    });
    const storage = memoryStorage();
    storage.map.set(
      KEY,
      JSON.stringify({ shape: { kind: "many", details: ["x", "y"] } }),
    );
    const form = createForm(union, {
      initialValues: { shape: { kind: "one", details: { a: "" } } },
    });
    persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual({
      shape: { kind: "many", details: ["x", "y"] },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("still refuses a provable schema change, and says where", () => {
    const plain = z.object({ address: z.object({ city: z.string() }) });
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ address: "1 High St" }));
    const form = createForm(plain, {
      initialValues: { address: { city: "" } },
    });
    const handle = persistForm(form, { key: KEY, storage });
    expect(form.getState().values).toEqual({ address: { city: "" } });
    expect(handle.load()).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('conflicts with the form\'s initial values at "address"'),
    );
  });

  it("says why a versioned draft was ignored, and stays quiet when none exists", () => {
    const storage = memoryStorage();
    storage.map.set(KEY, JSON.stringify({ __v: 1, values: initialValues }));
    const form = createForm(schema, { initialValues });
    persistForm(form, { key: KEY, storage, version: 2 });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("its version (1) is not the configured version (2)"),
    );
    warn.mockClear();
    const empty = memoryStorage();
    persistForm(createForm(schema, { initialValues }), {
      key: KEY,
      storage: empty,
      version: 2,
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
