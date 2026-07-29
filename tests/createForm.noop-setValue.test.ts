import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

// setValue's identity guard: writing the value already at the path is a
// FULL no-op — same state reference, no subscriber notifications, no
// server-error release, no array-op clearing. The motivating failure: a
// two-way sync where each side's watchValues writes what it just received
// back to the other side used to rebuild the values object on every echo
// and recurse until the stack overflowed.

const schema = z.object({
  name: z.string(),
  score: z.number().nullable(),
  address: z.object({ city: z.string() }),
});

const initialValues = {
  name: "Tim",
  score: null,
  address: { city: "PDX" },
};

describe("setValue identity guard (no-op writes)", () => {
  it("writing the identical value leaves the state reference unchanged", () => {
    const form = createForm(schema, { initialValues });
    const before = form.getState();
    form.setValue("name", "Tim");
    expect(form.getState()).toBe(before);
    expect(form.getState().values).toBe(before.values);
  });

  it("Object.is semantics: same object reference is a no-op, an equal clone is not", () => {
    const form = createForm(schema, { initialValues });
    const address = form.getField("address");
    const before = form.getState();
    form.setValue("address", address);
    expect(form.getState()).toBe(before);
    // A structurally equal but fresh object is a real write (reference
    // identity is the change signal, matching watchValue/useStore).
    form.setValue("address", { ...address });
    expect(form.getState()).not.toBe(before);
  });

  it("no-op writes fire no subscribers (watchValues, watchValue, subscribe)", () => {
    const form = createForm(schema, { initialValues });
    const values = vi.fn();
    const value = vi.fn();
    const raw = vi.fn();
    form.watchValues(values);
    form.watchValue("name", value);
    form.subscribe(raw);
    form.setValue("name", "Tim");
    form.setValue("score", null);
    form.setValue("address.city", "PDX");
    expect(values).not.toHaveBeenCalled();
    expect(value).not.toHaveBeenCalled();
    expect(raw).not.toHaveBeenCalled();
  });

  it("a no-op write does NOT release a server error on the path", () => {
    const form = createForm(schema, { initialValues });
    form.setError("name", ["taken"]);
    form.setValue("name", "Tim");
    expect(form.getState().errors["name"]).toEqual(["taken"]);
    // A real change still releases it (the pre-existing behavior).
    form.setValue("name", "Jane");
    expect(form.getState().errors["name"]).toBeUndefined();
  });

  it("undefined carve-out: writing undefined over an ABSENT key still creates it", () => {
    const optionalSchema = z.object({
      profile: z.object({ nickname: z.string().optional() }),
    });
    const form = createForm(optionalSchema, {
      initialValues: { profile: {} },
    });
    // The read is undefined either way, but {} vs { nickname: undefined }
    // differ (key count) — the write must go through so dirtiness and the
    // persisted shape see the key.
    const before = form.getState();
    form.setValue("profile.nickname", undefined);
    expect(form.getState()).not.toBe(before);
    expect(Object.hasOwn(form.getState().values.profile, "nickname")).toBe(
      true,
    );
    expect(form.getFieldState("profile").dirty).toBe(true);
    // ...and now that the key exists holding undefined, rewriting
    // undefined IS a no-op.
    const after = form.getState();
    form.setValue("profile.nickname", undefined);
    expect(form.getState()).toBe(after);
  });

  it("the echo-loop probe terminates: a listener writing the value back", () => {
    const a = createForm(schema, { initialValues });
    const b = createForm(schema, { initialValues });
    // Two-way sync: each side pushes every change to the other. Without the
    // guard, the second write rebuilds values, re-fires the first watcher,
    // and the pair recurses to a stack overflow.
    a.watchValues((values) => b.setValues(values));
    b.watchValues((values) => a.setValue("name", values.name ?? ""));
    a.setValue("name", "Jane");
    expect(a.getField("name")).toBe("Jane");
    expect(b.getField("name")).toBe("Jane");
  });

  it("a CHANGED value still does everything: new reference, dirty, watchers", () => {
    const form = createForm(schema, { initialValues });
    const values = vi.fn();
    form.watchValues(values);
    const before = form.getState();
    form.setValue("address.city", "SEA");
    expect(form.getState()).not.toBe(before);
    expect(form.getState().values).not.toBe(before.values);
    expect(form.getField("address.city")).toBe("SEA");
    expect(values).toHaveBeenCalledOnce();
    expect(form.dirtyFields()).toContain("address.city");
  });
});
