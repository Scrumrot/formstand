import { describe, expect, it } from "vitest";
import { z } from "zod";
import { flattenIssues, validateSync } from "../src/core/validation";

describe("flattenIssues", () => {
  it("returns an empty object for no issues", () => {
    expect(flattenIssues([])).toEqual({});
  });

  it("groups multiple messages under the same path", () => {
    const schema = z.object({ name: z.string().min(3).max(5) });
    const result = schema.safeParse({ name: "ab" });
    if (result.success) throw new Error("expected failure");
    const flat = flattenIssues(result.error.issues);
    expect(flat["name"]).toHaveLength(1);
  });

  it("joins nested paths with dots", () => {
    const schema = z.object({
      address: z.object({ city: z.string() }),
    });
    const result = schema.safeParse({ address: { city: 1 } });
    if (result.success) throw new Error("expected failure");
    expect(Object.keys(flattenIssues(result.error.issues))).toContain(
      "address.city",
    );
  });

  it("uses dotted index syntax for arrays", () => {
    const schema = z.object({
      users: z.array(z.object({ email: z.string() })),
    });
    const result = schema.safeParse({ users: [{ email: 1 }] });
    if (result.success) throw new Error("expected failure");
    expect(Object.keys(flattenIssues(result.error.issues))).toContain(
      "users.0.email",
    );
  });

  it("uses empty-string key for root-level issues", () => {
    const schema = z
      .object({ a: z.string(), b: z.string() })
      .refine((d) => d.a === d.b, { message: "must match" });
    const result = schema.safeParse({ a: "x", b: "y" });
    if (result.success) throw new Error("expected failure");
    const flat = flattenIssues(result.error.issues);
    expect(flat[""]).toEqual(["must match"]);
  });
});

describe("validateSync", () => {
  const schema = z.object({ name: z.string(), age: z.number() });

  it("returns kind=valid with parsed data when input is valid", () => {
    const result = validateSync(schema, { name: "Tim", age: 30 });
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error();
    expect(result.data).toEqual({ name: "Tim", age: 30 });
  });

  it("returns kind=invalid with an error map when input is invalid", () => {
    const result = validateSync(schema, {
      name: 1 as unknown as string,
      age: 30,
    });
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error();
    expect(result.errors["name"]).toBeDefined();
  });

  it("applies transforms on the output side", () => {
    const trimSchema = z.object({
      name: z.string().transform((s) => s.trim()),
    });
    const result = validateSync(trimSchema, { name: "  Tim  " });
    if (result.kind !== "valid") throw new Error();
    expect(result.data.name).toBe("Tim");
  });
});
