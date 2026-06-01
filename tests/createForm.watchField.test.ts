import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string(),
  age: z.number(),
  address: z.object({ city: z.string() }),
  users: z.array(z.object({ email: z.string() })),
});

describe("form.watchField", () => {
  it("fires when the watched field's value changes", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" }, users: [] },
    });
    const listener = vi.fn();
    const unsub = form.watchField("name", listener);

    form.setValue("name", "Jane");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ value: "Jane" });

    unsub();
  });

  it("does not fire when an unrelated field changes", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" }, users: [] },
    });
    const listener = vi.fn();
    form.watchField("name", listener);

    form.setValue("age", 99);
    expect(listener).not.toHaveBeenCalled();
  });

  it("fires when the field's error changes", () => {
    const form = createForm(schema, {
      initialValues: { name: "x", age: 30, address: { city: "NYC" }, users: [] },
    });
    const listener = vi.fn();
    form.watchField("name", listener);

    form.setError("name", ["bad"]);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      error: ["bad"],
    });
  });

  it("fires when touched or dirty flips", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" }, users: [] },
    });
    const listener = vi.fn();
    form.watchField("name", listener);

    form.setTouched("name", true);
    expect(listener).toHaveBeenCalledTimes(1);

    form.setValue("name", "Jane");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns an unsubscribe that stops further notifications", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" }, users: [] },
    });
    const listener = vi.fn();
    const unsub = form.watchField("name", listener);
    unsub();
    form.setValue("name", "Jane");
    expect(listener).not.toHaveBeenCalled();
  });

  it("types the snapshot value via the path", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" }, users: [] },
    });
    form.watchField("address.city", (snap) => {
      expectTypeOf(snap.value).toEqualTypeOf<string>();
    });
    form.watchField("age", (snap) => {
      expectTypeOf(snap.value).toEqualTypeOf<number>();
    });
  });

  it("rejects invalid paths at compile time", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" }, users: [] },
    });
    // @ts-expect-error - "missing" is not a path
    form.watchField("missing", () => {});
    expect(form).toBeDefined();
  });
});
