import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { type PersistStorage, persistForm } from "../src/core/persist";

// Regression pin for the third November 2026 review: the gap fill's
// container check stopped at lazy, intersection and preprocess schemas,
// so a plain required key under those roots was no longer filled.

const KEY = "formstand:round3-draft";

const memoryStorage = (): PersistStorage => {
  const map = new Map<string, string>();
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

const loaded = (schema: z.ZodType, initialValues: unknown, draft: unknown) => {
  const form = createForm(schema as never, { initialValues } as never);
  const storage = memoryStorage();
  storage.setItem(KEY, JSON.stringify(draft));
  persistForm(form as never, { key: KEY, storage });
  return form.getState().values;
};

describe("fillRequiredGaps under opaque roots", () => {
  const initial = { title: "", note: "" };
  const draft = { title: "x" };
  const filled = { title: "x", note: "" };

  it("fills under an intersection", () => {
    const schema = z
      .object({ title: z.string() })
      .and(z.object({ note: z.string() }));
    expect(loaded(schema, initial, draft)).toEqual(filled);
  });

  it("fills under a lazy schema", () => {
    const schema = z.lazy(() =>
      z.object({ title: z.string(), note: z.string() }),
    );
    expect(loaded(schema, initial, draft)).toEqual(filled);
  });

  it("fills under a preprocess", () => {
    const schema = z.preprocess(
      (v) => v,
      z.object({ title: z.string(), note: z.string() }),
    );
    expect(loaded(schema, initial, draft)).toEqual(filled);
  });

  it("fills a nested intersection and a nested lazy", () => {
    const schema = z.object({
      meta: z.object({ a: z.string() }).and(z.object({ b: z.string() })),
      more: z.lazy(() => z.object({ a: z.string(), b: z.string() })),
    });
    expect(
      loaded(
        schema,
        { meta: { a: "", b: "" }, more: { a: "", b: "" } },
        { meta: { a: "x" }, more: { a: "y" } },
      ),
    ).toEqual({ meta: { a: "x", b: "" }, more: { a: "y", b: "" } });
  });

  it("still leaves an optional key under those roots absent", () => {
    const schema = z.lazy(() =>
      z.object({ title: z.string(), note: z.string().optional() }),
    );
    expect(loaded(schema, { title: "", note: "n" }, draft)).toEqual(draft);
  });
});
