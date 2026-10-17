import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { type PersistStorage, persistForm } from "../src/core/persist";

// The October 2026 review's core-level findings, each pinned by the probe
// that found it.

const memoryStorage = (
  seed: Readonly<Record<string, string>> = {},
): PersistStorage => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

describe("persistForm refuses a null top-level draft", () => {
  const schema = z.object({ title: z.string() });

  it("an unversioned \"null\" in storage is not adopted", () => {
    const form = createForm(schema, { initialValues: { title: "" } });
    const handle = persistForm(form, {
      key: "k",
      storage: memoryStorage({ k: "null" }),
    });
    expect(handle.load()).toBe(false);
    expect(form.getState().values).toEqual({ title: "" });
  });

  it("a versioned wrapper holding values: null is not adopted", () => {
    const form = createForm(schema, { initialValues: { title: "" } });
    const handle = persistForm(form, {
      key: "k",
      version: 1,
      storage: memoryStorage({ k: JSON.stringify({ __v: 1, values: null }) }),
    });
    expect(handle.load()).toBe(false);
    expect(form.getState().values).toEqual({ title: "" });
  });

  it("a nested null stays a legal draft value", () => {
    const nullable = z.object({ bio: z.string().nullable() });
    const form = createForm(nullable, { initialValues: { bio: "" } });
    const handle = persistForm(form, {
      key: "k",
      storage: memoryStorage({ k: JSON.stringify({ bio: null }) }),
    });
    expect(handle.load()).toBe(true);
    expect(form.getState().values).toEqual({ bio: null });
  });
});

describe("handleSubmit keeps its never-rejects contract without a process global", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a throwing handler with no onError resolves and warns instead of rejecting", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "x" },
    });
    vi.stubGlobal("process", undefined);
    // Resolving (with the error-kind result) is the contract; before the
    // fix this rejected with "Cannot read properties of undefined (reading
    // 'env')" from the unguarded dev-warning check.
    await expect(
      form.handleSubmit(() => {
        throw new Error("save failed");
      })({ preventDefault() {} } as never),
    ).resolves.toMatchObject({ kind: "error" });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("array ops reject tuple paths at the type level", () => {
  const schema = z.object({
    pair: z.tuple([z.string(), z.number()]),
    list: z.array(z.number()),
  });

  it("the item type of a tuple path is never", () => {
    const form = createForm(schema, {
      initialValues: { pair: ["a", 1], list: [] },
    });
    // Type-level pins (tsc over tests/ enforces the directives): a tuple's
    // length is a literal, so a push/insert that could only grow a
    // fixed-arity value no longer compiles, while a real array still does.
    const neverRuns = (): void => {
      // @ts-expect-error a tuple accepts no pushed item
      form.arrayPush("pair", 5);
      // @ts-expect-error a tuple accepts no inserted item
      form.arrayInsert("pair", 0, "s");
      form.arrayPush("list", 5);
    };
    expect(typeof neverRuns).toBe("function");
    expect(form.getState().values.pair).toEqual(["a", 1]);
  });
});
