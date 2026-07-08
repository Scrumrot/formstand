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
    expect(form.getFieldState("name").dirty).toBe(true);

    form.setValue("name", "Tim");
    expect(form.getFieldState("name").dirty).toBe(false);
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
    expect(form.getFieldState("address").dirty).toBe(false);

    form.setValue("tags", ["a", "b"]);
    expect(form.getFieldState("tags").dirty).toBe(false);
    expect(form.dirtyFields()).toEqual([]);
  });

  it("marks an object dirty when its contents differ", () => {
    const form = makeForm();
    form.setValue("address", { city: "Boston", zip: "10001" });
    expect(form.getFieldState("address").dirty).toBe(true);
    expect(form.diff()).toEqual({
      "address.city": "Boston",
    });
  });

  it("marks a changed Date dirty (not collapsed to equal)", () => {
    const form = makeForm();
    // Different Date instance, different time.
    form.setValue("due", new Date("2021-06-06"));
    expect(form.getFieldState("due").dirty).toBe(true);
  });

  it("treats an equal-time Date set back to initial as not dirty", () => {
    const form = makeForm();
    form.setValue("due", new Date("2021-06-06"));
    expect(form.getFieldState("due").dirty).toBe(true);
    // Re-setting the original instance reverts cleanly.
    form.setValue("due", form.getState().initialValues.due);
    expect(form.getFieldState("due").dirty).toBe(false);
  });

  it("clears a nested path that reverts to initial", () => {
    const form = makeForm();
    form.setValue("address.city", "Boston");
    expect(form.getFieldState("address.city").dirty).toBe(true);

    form.setValue("address.city", "NYC");
    expect(form.getFieldState("address.city").dirty).toBe(false);
  });

  it("reverting a parent wholesale leaves no stale descendant dirtiness", () => {
    const form = makeForm();
    form.setValue("address.city", "Boston");
    // Restore via the parent path with a fresh-but-equal object — the child
    // edit must not linger anywhere.
    form.setValue("address", { city: "NYC", zip: "10001" });
    expect(form.dirtyFields()).toEqual([]);
    expect(form.getFieldState("address.city").dirty).toBe(false);
    expect(form.diff()).toEqual({});
  });
});

describe("dirty reporting for undefined-valued keys (key-count divergence)", () => {
  const profileSchema = z.object({
    profile: z.object({ nickname: z.string().optional() }),
  });

  it("dirtyFields/diff report the object when a key is added holding undefined", () => {
    const form = createForm(profileSchema, {
      initialValues: { profile: {} },
    });
    // {} vs { nickname: undefined }: no child diverges by its own comparison,
    // but the objects differ (key count) — the path report must agree with
    // isFieldDirty instead of returning empty.
    form.setValue("profile.nickname", undefined);
    expect(form.getFieldState("profile").dirty).toBe(true);
    expect(form.dirtyFields()).toEqual(["profile"]);
    expect(Object.keys(form.diff())).toEqual(["profile"]);
  });
});
