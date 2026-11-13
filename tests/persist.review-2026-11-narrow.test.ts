import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { type PersistStorage, persistForm } from "../src/core/persist";

// Regression pin for the narrow review of the round-3 diff (0.26.1): the
// gap fill's container check let the fill through z.any(), z.unknown()
// and z.custom() slots, so a key the draft had dropped under a free-form
// slot came back from the initial values.

const KEY = "formstand:narrow-draft";

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

describe("fillRequiredGaps under free-form slots", () => {
  const initial = { meta: { a: 1 } };
  const draft = { meta: { b: 2 } };

  it("leaves a dropped key under z.any() dropped", () => {
    expect(loaded(z.object({ meta: z.any() }), initial, draft)).toEqual(draft);
  });

  it("leaves a dropped key under z.unknown() dropped", () => {
    expect(loaded(z.object({ meta: z.unknown() }), initial, draft)).toEqual(
      draft,
    );
  });

  it("leaves a dropped key under z.custom() dropped", () => {
    const schema = z.object({
      meta: z.custom<Record<string, number>>((v) => typeof v === "object"),
    });
    expect(loaded(schema, initial, draft)).toEqual(draft);
  });

  it("still fills a sibling object slot next to the free-form one", () => {
    const schema = z.object({
      meta: z.any(),
      more: z.object({ a: z.number(), b: z.number() }),
    });
    expect(
      loaded(
        schema,
        { meta: { a: 1 }, more: { a: 1, b: 2 } },
        { meta: { b: 2 }, more: { a: 5 } },
      ),
    ).toEqual({ meta: { b: 2 }, more: { a: 5, b: 2 } });
  });
});
