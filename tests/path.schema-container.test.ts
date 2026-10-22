// The absent-slot rule, schema-informed: a numeric-string key written into
// an optional z.record that is still undefined used to create an ARRAY
// (the segment-type rule's only possible answer), which the record schema
// then rejected. createForm hands setAtPath the schema's answer for the
// slot being created; the bare utility keeps the segment-type rule.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { setAtPath } from "../src/core/path";
import { containerKindAt } from "../src/core/validation";

const schema = z.object({
  lookup: z.record(z.string(), z.string()).optional(),
  byNum: z.record(z.number(), z.string()).optional(),
  rows: z.array(z.object({ tags: z.array(z.string()).optional() })).optional(),
  nested: z
    .object({ perId: z.record(z.string(), z.object({ n: z.number() })) })
    .optional(),
  either: z.union([z.array(z.string()), z.record(z.string(), z.string())]).optional(),
});

type Values = z.input<typeof schema>;

const blank: Values = {};

describe("createForm writes create the container the schema declares", () => {
  it("a numeric key into an absent optional record creates a record", () => {
    const form = createForm(schema, { initialValues: blank });
    form.setValue("lookup.0", "x");
    expect(form.getState().values.lookup).toEqual({ "0": "x" });
    expect(Array.isArray(form.getState().values.lookup)).toBe(false);
    const result = form.validate();
    expect(result.kind).toBe("valid");
  });

  it("a number-keyed record is created as a record and validates", () => {
    const form = createForm(schema, { initialValues: blank });
    form.setValue("byNum.5", "five");
    expect(form.getState().values.byNum).toEqual({ "5": "five" });
    expect(form.validate().kind).toBe("valid");
  });

  it("a nested record under an absent optional object is created as a record", () => {
    const form = createForm(schema, { initialValues: blank });
    form.setValue("nested.perId.7.n", 1);
    expect(form.getState().values.nested).toEqual({ perId: { "7": { n: 1 } } });
    expect(form.validate().kind).toBe("valid");
  });

  it("arrays still come out as arrays, including through array ops", () => {
    const form = createForm(schema, { initialValues: blank });
    form.setValue("rows.0.tags.0", "a");
    expect(form.getState().values.rows).toEqual([{ tags: ["a"] }]);
    const next = createForm(schema, { initialValues: blank });
    next.arrayPush("rows", { tags: [] });
    expect(next.getState().values.rows).toEqual([{ tags: [] }]);
  });

  it("a union at the created level leaves the segment-type rule in charge", () => {
    // FieldPath offers no paths INTO a union, so the write goes through the
    // utility with the form's own resolver, as a runtime-built path would.
    const kindAt = containerKindAt(schema);
    expect(setAtPath(blank, "either.0", "x", kindAt)).toEqual({ either: ["x"] });
    expect(setAtPath(blank, "either.k", "x", kindAt)).toEqual({ either: { k: "x" } });
  });
});

describe("containerKindAt", () => {
  const kindAt = containerKindAt(schema);

  it("answers from the schema through wrappers", () => {
    expect(kindAt("lookup")).toBe("record");
    expect(kindAt("byNum")).toBe("record");
    expect(kindAt("rows")).toBe("array");
    expect(kindAt("rows.3.tags")).toBe("array");
    expect(kindAt("nested")).toBe("record");
    expect(kindAt("nested.perId")).toBe("record");
    expect(kindAt("nested.perId.9")).toBe("record");
  });

  it("has no opinion on leaves, unions, or unknown paths", () => {
    expect(kindAt("either")).toBeNull();
    expect(kindAt("nested.perId.9.n")).toBeNull();
    expect(kindAt("nope.deeper")).toBeNull();
  });
});

describe("containerKindAt stands aside at unions", () => {
  // A reviewer's reproduction: two variants declare the same key as an
  // object and as an array. Following the first member made the array
  // variant's write create a record, which its own schema then rejected.
  const union = z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("one"),
      details: z.object({ note: z.string() }).optional(),
    }),
    z.object({
      kind: z.literal("many"),
      details: z.array(z.string()).optional(),
    }),
  ]);

  it("has no opinion on a key that lives under a union", () => {
    const kindAt = containerKindAt(union);
    expect(kindAt("details")).toBeNull();
    expect(kindAt("details.0")).toBeNull();
  });

  it("the segment rule decides, so both variants validate after a write", () => {
    // FieldPath offers no paths INTO a union, so these writes use the
    // runtime-typed surface, the way a server-error mapper or a
    // hand-rolled FieldFormApi would.
    const write = (
      form: Readonly<{ setValue: (path: never, value: never) => void }>,
      path: string,
      value: unknown,
    ): void => form.setValue(path as never, value as never);
    const many = createForm(union, { initialValues: { kind: "many" } });
    write(many, "details.0", "x");
    expect(many.getState().values.details).toEqual(["x"]);
    expect(many.validate().kind).toBe("valid");

    const one = createForm(union, { initialValues: { kind: "one" } });
    write(one, "details.note", "hi");
    expect(one.getState().values.details).toEqual({ note: "hi" });
    expect(one.validate().kind).toBe("valid");
  });

  it("a union BELOW the created level does not matter", () => {
    // The union sits under the record's values; creating the record itself
    // is still the schema's call.
    const nested = z.object({
      byId: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional(),
    });
    const form = createForm(nested, { initialValues: {} });
    form.setValue("byId.0", "x");
    expect(form.getState().values.byId).toEqual({ "0": "x" });
    expect(form.validate().kind).toBe("valid");
  });
});

describe("setAtPath with a resolver", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the segment-type rule without a resolver", () => {
    expect(setAtPath({}, "lookup.0", "x")).toEqual({ lookup: ["x"] });
  });

  it("follows the resolver where it answers", () => {
    const kindAt = containerKindAt(schema);
    expect(setAtPath({}, "lookup.0", "x", kindAt)).toEqual({ lookup: { "0": "x" } });
    expect(setAtPath({}, "rows.0.tags.1", "b", kindAt)).toEqual({
      rows: [{ tags: [undefined, "b"] }],
    });
  });

  it("refuses a string key where the schema declares an array", () => {
    const kindAt = containerKindAt(schema);
    expect(setAtPath({}, "rows.first", "x", kindAt)).toEqual({});
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("existing containers still decide for themselves", () => {
    const kindAt = containerKindAt(schema);
    const obj = { lookup: { a: "1" } };
    expect(setAtPath(obj, "lookup.0", "x", kindAt)).toEqual({
      lookup: { a: "1", "0": "x" },
    });
  });
});
