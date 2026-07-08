import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { schemaHasPath } from "../src/core/validation";

// validateField/validateFieldAsync on a path the schema cannot contain
// silently return valid — the dev warning (once per path per form) is the
// only signal. These tests pin down when it fires and, just as importantly,
// when it must not (anything the lax walker can't judge).

const schema = z.object({
  name: z.string().min(1),
  address: z.object({ city: z.string() }).optional(),
  users: z.array(z.object({ email: z.string() })),
  meta: z.record(z.string(), z.string()),
});

const initialValues = {
  name: "Tim",
  address: { city: "Oslo" },
  users: [{ email: "a@a.com" }],
  meta: {},
};

describe("validateField warns for paths the schema cannot contain", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns once per bogus path per form, across sync and async", async () => {
    const form = createForm(schema, { initialValues });
    const result = form.validateField("naem" as never);
    expect(result).toEqual({ kind: "valid" });
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      '[formstand] validateField("naem"): path does not exist in the schema — result will always be valid.',
    );
    // Repeats — sync or async — stay quiet.
    form.validateField("naem" as never);
    await form.validateFieldAsync("naem" as never);
    expect(console.warn).toHaveBeenCalledOnce();
    // A different bogus path warns on its own.
    await form.validateFieldAsync("users.0.emial" as never);
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(console.warn).mock.calls[1]?.[0]).toContain(
      'validateFieldAsync("users.0.emial")',
    );
  });

  it("does not warn for valid, record, dynamic-index, or root paths", async () => {
    const form = createForm(schema, { initialValues });
    form.validateField("name");
    form.validateField("address.city");
    // Record keys are runtime data — the walker can't judge, so no warning.
    form.validateField("meta.anything" as never);
    // Out-of-range indices address a schema-legal slot shape; validateField
    // just skips them (see slotAtPath) — structurally the path exists.
    form.validateField("users.5.email");
    await form.validateFieldAsync("users.0.email");
    form.validateField("");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns for segments that descend into a scalar leaf", () => {
    const form = createForm(schema, { initialValues });
    form.validateField("name.first" as never);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("the warning cache is per form instance", () => {
    const a = createForm(schema, { initialValues });
    const b = createForm(schema, { initialValues });
    a.validateField("naem" as never);
    b.validateField("naem" as never);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});

describe("schemaHasPath (the lax structural walker)", () => {
  it("traverses optional/nullable/default/pipe wrappers", () => {
    const wrapped = z.object({
      profile: z
        .object({
          nick: z.string().nullable().default(null),
          age: z.string().pipe(z.transform(Number)),
        })
        .optional(),
    });
    expect(schemaHasPath(wrapped, "profile.nick")).toBe(true);
    expect(schemaHasPath(wrapped, "profile.age")).toBe(true);
    expect(schemaHasPath(wrapped, "profile.naem")).toBe(false);
  });

  it("cannot judge unions, records, maps, tuples, or lazies — answers true", () => {
    const dynamic = z.object({
      u: z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]),
      r: z.record(z.string(), z.number()),
      m: z.map(z.string(), z.number()),
      t: z.tuple([z.string(), z.number()]),
    });
    expect(schemaHasPath(dynamic, "u.a")).toBe(true);
    expect(schemaHasPath(dynamic, "u.zzz")).toBe(true);
    expect(schemaHasPath(dynamic, "r.someKey")).toBe(true);
    expect(schemaHasPath(dynamic, "m.someKey")).toBe(true);
    expect(schemaHasPath(dynamic, "t.0")).toBe(true);
  });

  it("open object shapes accept unknown keys; strict/closed ones do not", () => {
    const open = z.object({ base: z.looseObject({ a: z.string() }) });
    const strict = z.object({ base: z.strictObject({ a: z.string() }) });
    expect(schemaHasPath(open, "base.extra")).toBe(true);
    expect(schemaHasPath(strict, "base.extra")).toBe(false);
  });

  it("arrays take any numeric index but refuse string keys", () => {
    expect(schemaHasPath(schema, "users.42.email")).toBe(true);
    expect(schemaHasPath(schema, "users.email")).toBe(false);
  });
});
