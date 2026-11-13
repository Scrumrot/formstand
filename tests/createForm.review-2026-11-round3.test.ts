import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

// Regression pins for the third November 2026 review, core half: a write
// the path walker refuses is a full no-op, and a bailed field pass takes
// the full parse's current message for a key it already held.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a refused write is a no-op", () => {
  const schema = z.object({ when: z.date(), items: z.array(z.string()) });
  const write = (form: { setValue: (p: never, v: never) => void }, p: string, v: unknown) =>
    form.setValue(p as never, v as never);

  it("keeps the values reference, the watchers quiet and the spine verdicts", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const form = createForm(schema, {
      initialValues: { when: new Date(0), items: ["a"] },
    });
    form.setError("items", "server says no");
    form.setError("", "root says no");
    const fired = vi.fn();
    form.watchValues(fired);
    const before = form.getState().values;
    write(form, "items.foo", 1);
    write(form, "when.x", 1);
    expect(form.getState().values).toBe(before);
    expect(fired).not.toHaveBeenCalled();
    expect(form.getState().errors.items).toEqual(["server says no"]);
    expect(form.getState().errors[""]).toEqual(["root says no"]);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("still creates a key when undefined is written over an absent slot", () => {
    const loose = z.object({ note: z.string().optional() });
    const form = createForm(loose, { initialValues: {} });
    const before = form.getState().values;
    form.setValue("note", undefined);
    expect(form.getState().values).not.toBe(before);
    expect(Object.hasOwn(form.getState().values, "note")).toBe(true);
  });
});

describe("a bailed field pass refreshes an out-of-scope message", () => {
  const schema = z
    .object({ a: z.string(), b: z.string() })
    .superRefine((v, ctx) => {
      if (v.a !== v.b) {
        ctx.addIssue({ code: "custom", path: ["b"], message: `must equal ${v.a}` });
      }
    });

  it("takes the full parse's current list for a key already held", () => {
    const form = createForm(schema, { initialValues: { a: "1", b: "x" } });
    form.validate();
    expect(form.getState().errors.b).toEqual(["must equal 1"]);
    form.setValue("a", "2");
    form.validateField("a");
    expect(form.getState().errors.b).toEqual(["must equal 2"]);
    // Equal messages keep their list identity, so subscribers stay quiet.
    const list = form.getState().errors.b;
    form.validateField("a");
    expect(form.getState().errors.b).toBe(list);
  });

  it("still never adds an entry outside the scope", () => {
    const form = createForm(schema, { initialValues: { a: "1", b: "x" } });
    form.validateField("a");
    expect(form.getState().errors).toEqual({});
  });
});
