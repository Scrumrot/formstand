import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string().min(2),
  age: z.number(),
});

describe("form.adoptValues", () => {
  it("sets values, updates initialValues, clears errors and dirty", () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    form.setValue("name", "x");
    form.setError("name", ["bad"]);
    form.setTouched("name", true);

    form.adoptValues({ name: "Jane", age: 31 });

    expect(form.getState().values).toEqual({ name: "Jane", age: 31 });
    expect(form.getState().initialValues).toEqual({ name: "Jane", age: 31 });
    expect(form.getState().errors).toEqual({});
    expect(form.getState().dirty).toEqual({});
    expect(form.getState().touched["name"]).toBe(true);
  });

  it("preserves submitCount", () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    void form.submit(() => {});
    const before = form.getState().submitCount;
    form.adoptValues({ name: "Jane", age: 31 });
    expect(form.getState().submitCount).toBe(before);
  });
});

describe("form.submit concurrent guard", () => {
  it("short-circuits when isSubmitting is already true", async () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    const handler = vi.fn(
      () => new Promise<void>((r) => setTimeout(r, 30)),
    );
    const first = form.submit(handler);
    expect(form.getState().isSubmitting).toBe(true);
    const second = form.submit(handler);
    await Promise.all([first, second]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(form.getState().submitCount).toBe(1);
  });

  it("does NOT short-circuit when force: true", async () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    const handler = vi.fn(
      () => new Promise<void>((r) => setTimeout(r, 30)),
    );
    const first = form.submit(handler);
    const second = form.submit(handler, undefined, { force: true });
    await Promise.all([first, second]);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("updateState no-op short-circuit", () => {
  it("does not notify subscribers when patch is empty", () => {
    const form = createForm(schema, { initialValues: { name: "Tim", age: 30 } });
    const listener = vi.fn();
    form.subscribe(listener);
    form.updateState(() => ({}));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("validateFields empty short-circuit", () => {
  it("returns true and does not touch errors when paths is empty", () => {
    const form = createForm(schema, { initialValues: { name: "x", age: 30 } });
    form.validate();
    const before = form.getState().errors;
    const ok = form.validateFields([]);
    expect(ok).toBe(true);
    expect(form.getState().errors).toBe(before);
  });
});
