import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  tags: z.array(z.string().min(1)),
});

const makeForm = () =>
  createForm(schema, { initialValues: { tags: ["a", "b"] } });

describe("field-scoped validation of paths that no longer exist", () => {
  it("validateField on an out-of-range index is valid and writes nothing", () => {
    const form = makeForm();
    const result = form.validateField("tags.5");
    expect(result.kind).toBe("valid");
    expect(form.getState().errors).toEqual({});
  });

  it("a stale async validation after a row removal clears instead of fabricating an error", async () => {
    const form = makeForm();
    form.arrayRemove("tags", 1);
    // Simulates a debounced useField("tags.1") whose timer fires post-removal.
    const result = await form.validateFieldAsync("tags.1");
    expect(result.kind).toBe("valid");
    expect(form.getState().errors["tags.1"]).toBeUndefined();
  });

  it("still clears a lingering error at the removed index", () => {
    const form = createForm(schema, { initialValues: { tags: ["a", ""] } });
    form.validateField("tags.1");
    expect(form.getState().errors["tags.1"]).toBeDefined();
    form.arrayRemove("tags", 1);
    const result = form.validateField("tags.1");
    expect(result.kind).toBe("valid");
    expect(form.getState().errors["tags.1"]).toBeUndefined();
  });

  it("in-range indices still validate through the subschema", () => {
    const form = makeForm();
    form.setValue("tags.1", "");
    const result = form.validateField("tags.1");
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors["tags.1"]).toBeDefined();
  });
});
