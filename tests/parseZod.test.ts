import { describe, expect, it } from "vitest";
import { parseZod } from "../examples/src/forms/SchemaBuilder/parseZod";

// The Schema builder's paste-zod parser: evaluate a pasted `z.object(...)`
// against the bundled zod, then walk it with the real `fromZod`. Assert the
// derived form name and IR shape; the fromZod walk and the emitters are
// separately tested in cli/. This file also pins the eval frontend: binding
// detection, import/export stripping, and error surfaces.

const parse = (src: string) => {
  const result = parseZod(src);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
};

describe("parseZod", () => {
  it("reads scalar kinds and derives the form name from the binding", () => {
    const { formName, ir } = parse(`const contactSchema = z.object({
      fullName: z.string(),
      age: z.number(),
      active: z.boolean(),
      born: z.date(),
    })`);
    expect(formName).toBe("ContactForm");
    expect(ir.kind).toBe("object");
    if (ir.kind !== "object") return;
    expect(ir.fields.map((f) => [f.name, f.spec.kind])).toEqual([
      ["fullName", "string"],
      ["age", "number"],
      ["active", "boolean"],
      ["born", "date"],
    ]);
  });

  it("accepts a bare expression (no binding) and names it generically", () => {
    const { formName, ir } = parse(`z.object({ email: z.string() })`);
    expect(formName).toBe("SchemaForm");
    expect(ir.kind).toBe("object");
  });

  it("strips import lines and unwraps export", () => {
    const { formName, ir } = parse(`import { z } from "zod";
      export const profileSchema = z.object({ name: z.string() });`);
    expect(formName).toBe("ProfileForm");
    if (ir.kind !== "object") throw new Error("object");
    expect(ir.fields).toHaveLength(1);
  });

  it("optional and nullable map through", () => {
    const { ir } = parse(`const s = z.object({
      a: z.string().optional(),
      b: z.number().nullable(),
    })`);
    if (ir.kind !== "object") throw new Error("object");
    expect(ir.fields[0]!.spec.optional).toBe(true);
    expect(ir.fields[1]!.spec.nullable).toBe(true);
  });

  it("enums come through as enum specs", () => {
    const { ir } = parse(`const s = z.object({
      role: z.enum(["admin", "editor", "viewer"]),
    })`);
    if (ir.kind !== "object") throw new Error("object");
    const role = ir.fields[0]!.spec;
    expect(role.kind).toBe("enum");
    if (role.kind === "enum") {
      expect(role.options).toEqual(["admin", "editor", "viewer"]);
    }
  });

  it("nested objects and arrays of objects", () => {
    const { ir } = parse(`const s = z.object({
      address: z.object({ street: z.string(), city: z.string() }),
      contacts: z.array(z.object({ email: z.string() })),
    })`);
    if (ir.kind !== "object") throw new Error("object");
    const address = ir.fields[0]!.spec;
    expect(address.kind).toBe("object");
    if (address.kind === "object") expect(address.fields).toHaveLength(2);
    const contacts = ir.fields[1]!.spec;
    expect(contacts.kind).toBe("array");
    if (contacts.kind === "array") expect(contacts.item.kind).toBe("object");
  });

  it("uses the LAST binding when several are present", () => {
    const { formName } = parse(`const inner = z.string();
      const userSchema = z.object({ name: inner });`);
    expect(formName).toBe("UserForm");
  });

  it("errors on a syntax error, a non-schema value, and a non-object root", () => {
    expect(parseZod("z.object({").ok).toBe(false); // syntax
    expect(parseZod("const x = 1").ok).toBe(false); // not a schema
    expect(parseZod("z.string()").ok).toBe(false); // not an object root
    expect(parseZod("   ").ok).toBe(false); // empty
  });
});
