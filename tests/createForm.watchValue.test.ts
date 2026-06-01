import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

describe("form.watchValue", () => {
  it("fires when value changes", () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    const listener = vi.fn();
    form.watchValue("name", listener);
    form.setValue("name", "Jane");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]).toEqual(["Jane", "Tim"]);
  });

  it("does NOT fire when only touched/error changes", () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    const listener = vi.fn();
    form.watchValue("name", listener);
    form.setTouched("name", true);
    form.setError("name", ["x"]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not fire for unrelated value changes", () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    const listener = vi.fn();
    form.watchValue("name", listener);
    form.setValue("age", 99);
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns unsubscribe", () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    const listener = vi.fn();
    const unsub = form.watchValue("name", listener);
    unsub();
    form.setValue("name", "Jane");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("form.watchValues", () => {
  it("fires when any value changes", () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    const listener = vi.fn();
    form.watchValues(listener);
    form.setValue("name", "Jane");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toEqual({ name: "Jane", age: 30 });
    expect(listener.mock.calls[0]?.[1]).toEqual({ name: "Tim", age: 30 });
  });

  it("does NOT fire on error/touched/dirty changes alone", () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    const listener = vi.fn();
    form.watchValues(listener);
    form.setTouched("name", true);
    form.setError("name", ["x"]);
    form.clearErrors();
    expect(listener).not.toHaveBeenCalled();
  });
});
