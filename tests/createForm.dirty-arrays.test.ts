import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
});

const makeForm = () =>
  createForm(schema, { initialValues: { name: "Tim", tags: ["a"] } });

describe("array ops and derived dirtiness", () => {
  it("arrayPush makes the array path dirty and diff() reflects it", () => {
    const form = makeForm();
    form.arrayPush("tags", "b");
    expect(form.getFieldState("tags").dirty).toBe(true);
    expect(form.dirtyFields()).toContain("tags");
    expect(form.diff()).toEqual({ tags: ["a", "b"] });
  });

  it("push then remove reverts the array path to clean", () => {
    const form = makeForm();
    form.arrayPush("tags", "b");
    form.arrayRemove("tags", 1);
    expect(form.dirtyFields()).toEqual([]);
    expect(form.diff()).toEqual({});
  });

  it("arrayMove makes dirty and moving back clears it", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", tags: ["a", "b"] },
    });
    form.arrayMove("tags", 0, 1);
    expect(form.getFieldState("tags").dirty).toBe(true);
    form.arrayMove("tags", 0, 1);
    expect(form.getFieldState("tags").dirty).toBe(false);
  });

  it("arrayRemove of an initial item makes dirty", () => {
    const form = makeForm();
    form.arrayRemove("tags", 0);
    expect(form.getFieldState("tags").dirty).toBe(true);
    expect(form.diff()).toEqual({ tags: [] });
  });
});

describe("setValues and derived dirtiness", () => {
  it("reports changed top-level keys dirty", () => {
    const form = makeForm();
    form.setValues({ name: "Anna", tags: ["a"] });
    expect(form.dirtyFields()).toEqual(["name"]);
    expect(form.diff()).toEqual({ name: "Anna" });
  });

  it("clears dirtiness when set back to the initial values", () => {
    const form = makeForm();
    form.setValues({ name: "Anna", tags: ["a", "b"] });
    expect([...form.dirtyFields()].sort()).toEqual(["name", "tags"]);
    form.setValues({ name: "Tim", tags: ["a"] });
    expect(form.dirtyFields()).toEqual([]);
  });
});
