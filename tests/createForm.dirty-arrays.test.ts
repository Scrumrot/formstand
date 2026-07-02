import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
});

const makeForm = () =>
  createForm(schema, { initialValues: { name: "Tim", tags: ["a"] } });

describe("array ops update the dirty map", () => {
  it("arrayPush marks the array path dirty and diff() reflects it", () => {
    const form = makeForm();
    form.arrayPush("tags", "b");
    expect(form.getState().dirty["tags"]).toBe(true);
    expect(form.dirtyFields()).toContain("tags");
    expect(form.diff()).toEqual({ tags: ["a", "b"] });
  });

  it("push then remove reverts the array path to clean", () => {
    const form = makeForm();
    form.arrayPush("tags", "b");
    form.arrayRemove("tags", 1);
    expect(form.getState().dirty).toEqual({});
    expect(form.diff()).toEqual({});
  });

  it("arrayMove marks dirty and moving back clears it", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", tags: ["a", "b"] },
    });
    form.arrayMove("tags", 0, 1);
    expect(form.getState().dirty["tags"]).toBe(true);
    form.arrayMove("tags", 0, 1);
    expect(form.getState().dirty["tags"]).toBeUndefined();
  });

  it("arrayRemove of an initial item marks dirty", () => {
    const form = makeForm();
    form.arrayRemove("tags", 0);
    expect(form.getState().dirty["tags"]).toBe(true);
    expect(form.diff()).toEqual({ tags: [] });
  });
});

describe("setValues updates the dirty map", () => {
  it("marks changed top-level keys dirty", () => {
    const form = makeForm();
    form.setValues({ name: "Anna", tags: ["a"] });
    expect(form.getState().dirty).toEqual({ name: true });
    expect(form.diff()).toEqual({ name: "Anna" });
  });

  it("clears dirtiness when set back to the initial values", () => {
    const form = makeForm();
    form.setValues({ name: "Anna", tags: ["a", "b"] });
    expect([...form.dirtyFields()].sort()).toEqual(["name", "tags"]);
    form.setValues({ name: "Tim", tags: ["a"] });
    expect(form.getState().dirty).toEqual({});
  });
});
