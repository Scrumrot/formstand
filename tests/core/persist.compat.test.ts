// A stored draft outliving the schema that wrote it. Before this guard,
// persistForm cast the parsed JSON straight to the values type and adopted it,
// so a draft from an older shape rebased the form onto data its own schema
// rejects -- and because "adopt" clears errors, the form read CLEAN while
// holding it.
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { persistForm, type PersistStorage } from "../../src/core/persist";

const memoryStorage = (): PersistStorage & { readonly map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
});

describe("a draft from a different schema shape", () => {
  it("is ignored when a path's kind conflicts", () => {
    // v1 stored `contact` as a string; v2 made it an object.
    storage.map.set("k", JSON.stringify({ contact: "ada@example.com" }));
    const form = createForm(
      z.object({ contact: z.object({ email: z.string() }) }),
      { initialValues: { contact: { email: "" } } },
    );
    const handle = persistForm(form, { key: "k", storage, apply: "manual" });
    expect(handle.restore()).toBe(false);
    expect(form.getState().values).toEqual({ contact: { email: "" } });
  });

  it("is ignored when an array's row shape conflicts and the initials have a row", () => {
    storage.map.set("k", JSON.stringify({ tags: ["a", "b"] }));
    const form = createForm(
      z.object({ tags: z.array(z.object({ label: z.string() })) }),
      { initialValues: { tags: [{ label: "" }] } },
    );
    const handle = persistForm(form, { key: "k", storage, apply: "manual" });
    expect(handle.restore()).toBe(false);
  });

  it("KNOWN LIMIT: an empty initial array cannot vouch for its row shape", () => {
    // initialValues: { tags: [] } carries no information about what a row
    // looks like, so a draft of the wrong row shape passes the automatic
    // guard. There is nothing to compare against; `version` is the answer for
    // a schema change this guard cannot see. Pinned so the limit is a
    // decision on record rather than a surprise.
    storage.map.set("k", JSON.stringify({ tags: ["a", "b"] }));
    const form = createForm(
      z.object({ tags: z.array(z.object({ label: z.string() })) }),
      { initialValues: { tags: [] } },
    );
    const handle = persistForm(form, { key: "k", storage, apply: "manual" });
    expect(handle.restore()).toBe(true);
  });

  it("does NOT reject a legitimate draft that merely differs in values", () => {
    // The guard must not be so eager that it throws away real drafts.
    storage.map.set(
      "k",
      JSON.stringify({ name: "half typed", tags: ["x", "y", "z"] }),
    );
    const form = createForm(
      z.object({ name: z.string(), tags: z.array(z.string()) }),
      { initialValues: { name: "", tags: [] } },
    );
    const handle = persistForm(form, { key: "k", storage, apply: "manual" });
    expect(handle.restore()).toBe(true);
    expect(form.getState().values.name).toBe("half typed");
  });

  it("does NOT reject a draft that filled an optional the initials left empty", () => {
    // JSON drops undefined, so `bio` is absent from the reference but present
    // in the draft. That is an ordinary edit, not a schema change.
    storage.map.set("k", JSON.stringify({ name: "ada", bio: "engineer" }));
    const form = createForm(
      z.object({ name: z.string(), bio: z.string().optional() }),
      { initialValues: { name: "", bio: undefined } },
    );
    const handle = persistForm(form, { key: "k", storage, apply: "manual" });
    expect(handle.restore()).toBe(true);
    expect(form.getState().values.bio).toBe("engineer");
  });

  // null is the canonical empty for a nullable field, so it can appear at any
  // nullable path whatever that path's filled shape is. An earlier version of
  // this guard read null-vs-object as a kind conflict, which silently
  // discarded the drafts of every form with a nullable field.
  it("does NOT reject a nullable that started null and was filled in", () => {
    storage.map.set("k", JSON.stringify({ address: { city: "London" } }));
    const form = createForm(
      z.object({ address: z.object({ city: z.string() }).nullable() }),
      { initialValues: { address: null } },
    );
    const handle = persistForm(form, { key: "k", storage, apply: "manual" });
    expect(handle.restore()).toBe(true);
    expect(form.getState().values.address).toEqual({ city: "London" });
  });

  it("does NOT reject a nullable that started filled and was cleared", () => {
    storage.map.set("k", JSON.stringify({ address: null }));
    const form = createForm(
      z.object({ address: z.object({ city: z.string() }).nullable() }),
      { initialValues: { address: { city: "London" } } },
    );
    const handle = persistForm(form, { key: "k", storage, apply: "manual" });
    expect(handle.restore()).toBe(true);
    expect(form.getState().values.address).toBeNull();
  });

  it("does NOT reject a cleared nullable leaf", () => {
    storage.map.set("k", JSON.stringify({ age: null }));
    const form = createForm(z.object({ age: z.number().nullable() }), {
      initialValues: { age: 30 },
    });
    const handle = persistForm(form, { key: "k", storage, apply: "manual" });
    expect(handle.restore()).toBe(true);
  });

  it("restores a half-filled draft the full schema would reject", () => {
    // A draft is work in progress. Validating it against the schema before
    // applying would throw away exactly the drafts worth keeping.
    storage.map.set("k", JSON.stringify({ email: "ad" }));
    const form = createForm(z.object({ email: z.string().email() }), {
      initialValues: { email: "" },
    });
    const handle = persistForm(form, { key: "k", storage, apply: "manual" });
    expect(handle.restore()).toBe(true);
    expect(form.getState().values.email).toBe("ad");
  });
});

describe("version", () => {
  it("ignores a draft written under a different version", () => {
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "" },
    });
    const v1 = persistForm(form, {
      key: "k",
      storage,
      version: 1,
      debounceMs: 0,
      apply: "manual",
    });
    form.setValue("a", "typed under v1");
    v1.dispose();

    const later = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "" },
    });
    const v2 = persistForm(later, {
      key: "k",
      storage,
      version: 2,
      apply: "manual",
    });
    expect(v2.restore()).toBe(false);
    expect(later.getState().values.a).toBe("");
  });

  it("restores a draft written under the same version", () => {
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "" },
    });
    const w = persistForm(form, {
      key: "k",
      storage,
      version: "2026-07",
      debounceMs: 0,
      apply: "manual",
    });
    form.setValue("a", "kept");
    w.dispose();

    const later = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "" },
    });
    const r = persistForm(later, {
      key: "k",
      storage,
      version: "2026-07",
      apply: "manual",
    });
    expect(r.restore()).toBe(true);
    expect(later.getState().values.a).toBe("kept");
  });

  it("ignores a pre-versioning draft once a version is configured", () => {
    // Bare values in storage predate the wrapper, so they predate the schema
    // the version is asserting.
    storage.map.set("k", JSON.stringify({ a: "written before versioning" }));
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "" },
    });
    const handle = persistForm(form, {
      key: "k",
      storage,
      version: 1,
      apply: "manual",
    });
    expect(handle.restore()).toBe(false);
  });

  it("round-trips values that themselves contain a __v key", () => {
    // The wrapper key could collide with real user data. It does not, because
    // the payload is nested under `values` rather than merged.
    const form = createForm(z.object({ __v: z.string() }), {
      initialValues: { __v: "" },
    });
    const w = persistForm(form, {
      key: "k",
      storage,
      version: 1,
      debounceMs: 0,
      apply: "manual",
    });
    form.setValue("__v", "user data");
    w.dispose();

    const later = createForm(z.object({ __v: z.string() }), {
      initialValues: { __v: "" },
    });
    const r = persistForm(later, {
      key: "k",
      storage,
      version: 1,
      apply: "manual",
    });
    expect(r.restore()).toBe(true);
    expect(later.getState().values.__v).toBe("user data");
  });

  it("ignores a wrapper carrying no payload", () => {
    // Tampered or foreign storage. Applying it would write undefined over the
    // entire values object.
    storage.map.set("k", JSON.stringify({ __v: 1 }));
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "keep me" },
    });
    const handle = persistForm(form, {
      key: "k",
      storage,
      version: 1,
      apply: "manual",
    });
    expect(handle.restore()).toBe(false);
    expect(form.getState().values.a).toBe("keep me");
  });

  it("leaves the stored format unchanged when no version is set", () => {
    // Existing drafts must survive an upgrade, so the bytes stay identical.
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "" },
    });
    const handle = persistForm(form, { key: "k", storage, debounceMs: 0 });
    form.setValue("a", "x");
    expect(storage.map.get("k")).toBe(JSON.stringify({ a: "x" }));
    handle.dispose();
  });
});
