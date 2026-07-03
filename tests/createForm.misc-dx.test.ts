import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import {
  useFormSelector,
  useFormSelectorShallow,
  useFormState,
  useFormStateShallow,
} from "../src/react/useFormState";

describe("Date values in dirty tracking", () => {
  it("re-picking an equal Date reads as clean", () => {
    const schema = z.object({ born: z.date() });
    const initial = new Date("2000-01-02T00:00:00Z");
    const form = createForm(schema, { initialValues: { born: initial } });
    form.setValue("born", new Date("2000-01-02T00:00:00Z"));
    expect(form.dirtyFields()).toEqual([]);
    form.setValue("born", new Date("2001-05-06T00:00:00Z"));
    expect(form.getFieldState("born").dirty).toBe(true);
  });
});

describe("clearErrors clears descendants", () => {
  it("clearErrors('items') also drops items.0.name", () => {
    const schema = z.object({
      items: z.array(z.object({ name: z.string() })),
    });
    const form = createForm(schema, { initialValues: { items: [] } });
    form.setError("items", ["array-level"]);
    form.setError("items.0.name" as never, ["row-level"]);
    form.setError("name" as never, ["unrelated"]);
    form.clearErrors("items");
    expect(form.getState().errors).toEqual({ name: ["unrelated"] });
  });
});

describe("setError convenience", () => {
  it("accepts a single string", () => {
    const schema = z.object({ name: z.string() });
    const form = createForm(schema, { initialValues: { name: "x" } });
    form.setError("name", "just one message");
    expect(form.getState().errors["name"]).toEqual(["just one message"]);
  });
});

describe("getFieldState", () => {
  it("returns the field's full slice", () => {
    const schema = z.object({ name: z.string().min(5, "short") });
    const form = createForm(schema, { initialValues: { name: "abc" } });
    form.setValue("name", "abcd");
    form.setTouched("name");
    form.validateField("name");
    const snap = form.getFieldState("name");
    expect(snap.value).toBe("abcd");
    expect(snap.touched).toBe(true);
    expect(snap.dirty).toBe(true);
    expect(snap.error).toEqual(["short"]);
    expect(snap.isValidating).toBe(false);
  });
});

describe("useFormSelector rename", () => {
  it("keeps the deprecated names as aliases of the new ones", () => {
    expect(useFormState).toBe(useFormSelector);
    expect(useFormStateShallow).toBe(useFormSelectorShallow);
  });
});
