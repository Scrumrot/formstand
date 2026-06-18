import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string(),
  age: z.number(),
  address: z.object({ city: z.string(), zip: z.string() }),
  tags: z.array(z.string()),
  due: z.date(),
});

const makeForm = () =>
  createForm(schema, {
    initialValues: {
      name: "Tim",
      age: 30,
      address: { city: "NYC", zip: "10001" },
      tags: ["a", "b"],
      due: new Date("2020-01-01"),
    },
  });

describe("dirty clears when a value reverts to its initial", () => {
  it("clears the dirty flag for a primitive set back to initial", () => {
    const form = makeForm();
    form.setValue("name", "Jane");
    expect(form.getState().dirty.name).toBe(true);

    form.setValue("name", "Tim");
    expect(form.getState().dirty.name).toBeUndefined();
    expect(form.dirtyFields()).toEqual([]);
    expect(form.diff()).toEqual({});
  });

  it("keeps unrelated dirty fields when one reverts", () => {
    const form = makeForm();
    form.setValue("name", "Jane");
    form.setValue("age", 31);
    form.setValue("name", "Tim");

    expect(form.dirtyFields()).toEqual(["age"]);
    expect(form.diff()).toEqual({ age: 31 });
  });

  it("treats a structurally-equal object/array as not dirty", () => {
    const form = makeForm();
    // Fresh object reference, same contents.
    form.setValue("address", { city: "NYC", zip: "10001" });
    expect(form.getState().dirty.address).toBeUndefined();

    form.setValue("tags", ["a", "b"]);
    expect(form.getState().dirty.tags).toBeUndefined();
    expect(form.dirtyFields()).toEqual([]);
  });

  it("marks an object dirty when its contents differ", () => {
    const form = makeForm();
    form.setValue("address", { city: "Boston", zip: "10001" });
    expect(form.getState().dirty.address).toBe(true);
    expect(form.diff()).toEqual({
      address: { city: "Boston", zip: "10001" },
    });
  });

  it("marks a changed Date dirty (not collapsed to equal)", () => {
    const form = makeForm();
    // Different Date instance, different time.
    form.setValue("due", new Date("2021-06-06"));
    expect(form.getState().dirty.due).toBe(true);
  });

  it("treats an equal-time Date set back to initial as not dirty", () => {
    const form = makeForm();
    form.setValue("due", new Date("2021-06-06"));
    expect(form.getState().dirty.due).toBe(true);
    // Re-setting the original instance reverts cleanly.
    form.setValue("due", form.getState().initialValues.due);
    expect(form.getState().dirty.due).toBeUndefined();
  });

  it("clears a nested path that reverts to initial", () => {
    const form = makeForm();
    form.setValue("address.city", "Boston");
    expect(form.getState().dirty["address.city"]).toBe(true);

    form.setValue("address.city", "NYC");
    expect(form.getState().dirty["address.city"]).toBeUndefined();
  });
});
