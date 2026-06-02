import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string().min(2),
  age: z.number(),
  address: z.object({ city: z.string() }),
});

describe("form.handleSubmit", () => {
  it("calls preventDefault and runs submit", async () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" } },
    });
    const handler = vi.fn();
    const preventDefault = vi.fn();
    await form.handleSubmit(handler)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("works without an event argument", async () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" } },
    });
    const handler = vi.fn();
    await form.handleSubmit(handler)();
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("form.diff + dirtyFields", () => {
  it("diff returns only changed paths with current values", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" } },
    });
    form.setValue("name", "Jane");
    form.setValue("address.city", "Boston");
    expect(form.diff()).toEqual({
      name: "Jane",
      "address.city": "Boston",
    });
  });

  it("dirtyFields lists dirty path keys", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" } },
    });
    expect(form.dirtyFields()).toEqual([]);
    form.setValue("name", "Jane");
    form.setValue("age", 31);
    expect([...form.dirtyFields()].sort()).toEqual(["age", "name"]);
  });
});

describe("form.snapshot + form.restore", () => {
  it("captures and restores full state", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30, address: { city: "NYC" } },
    });
    form.setValue("name", "Jane");
    form.setTouched("name", true);
    const snap = form.snapshot();

    form.setValue("name", "Bob");
    form.setError("name", ["nope"]);
    expect(form.getState().values.name).toBe("Bob");

    form.restore(snap);
    expect(form.getState().values.name).toBe("Jane");
    expect(form.getState().touched["name"]).toBe(true);
    expect(form.getState().errors).toEqual({});
  });
});
