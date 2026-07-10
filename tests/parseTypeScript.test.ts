import { describe, expect, it } from "vitest";
import { parseTypeScript } from "../examples/src/forms/SchemaBuilder/parseTypeScript";

// The Schema builder's paste-TS parser: TS-interface subset -> FieldSpec IR
// (no TypeScript compiler). Assert the IR shape; the emitters that consume
// it are separately tested in cli/.

const parse = (src: string) => {
  const result = parseTypeScript(src);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
};

describe("parseTypeScript", () => {
  it("reads scalar kinds, optional, and the form name", () => {
    const { formName, ir } = parse(`interface Profile {
      name: string;
      age: number;
      active: boolean;
      born: Date;
      nickname?: string;
    }`);
    expect(formName).toBe("ProfileForm");
    expect(ir.kind).toBe("object");
    if (ir.kind !== "object") return;
    expect(ir.fields.map((f) => [f.name, f.spec.kind])).toEqual([
      ["name", "string"],
      ["age", "number"],
      ["active", "boolean"],
      ["born", "date"],
      ["nickname", "string"],
    ]);
    expect(ir.fields.find((f) => f.name === "nickname")?.spec.optional).toBe(true);
    expect(ir.fields.find((f) => f.name === "name")?.spec.optional).toBe(false);
  });

  it("type alias form works too", () => {
    const { formName } = parse(`type Contact = { email: string }`);
    expect(formName).toBe("ContactForm");
  });

  it("string-literal unions become enums", () => {
    const { ir } = parse(`interface T { role: "admin" | "editor" | "viewer" }`);
    if (ir.kind !== "object") throw new Error("object");
    const role = ir.fields[0]!.spec;
    expect(role.kind).toBe("enum");
    if (role.kind === "enum") expect(role.options).toEqual(["admin", "editor", "viewer"]);
  });

  it("| null is nullable, | undefined is optional", () => {
    const { ir } = parse(`interface T {
      a: string | null;
      b: number | undefined;
    }`);
    if (ir.kind !== "object") throw new Error("object");
    expect(ir.fields[0]!.spec.nullable).toBe(true);
    expect(ir.fields[1]!.spec.optional).toBe(true);
  });

  it("arrays: T[], T[][], Array<T>", () => {
    const { ir } = parse(`interface T {
      tags: string[];
      grid: number[][];
      ids: Array<string>;
    }`);
    if (ir.kind !== "object") throw new Error("object");
    const [tags, grid, ids] = ir.fields.map((f) => f.spec);
    expect(tags!.kind).toBe("array");
    if (tags!.kind === "array") expect(tags!.item.kind).toBe("string");
    if (grid!.kind === "array")
      expect(grid!.item.kind === "array" && grid!.item.item.kind).toBe("number");
    expect(ids!.kind).toBe("array");
  });

  it("nested objects and arrays of objects", () => {
    const { ir } = parse(`interface T {
      address: { street: string; city: string };
      contacts: { email: string }[];
    }`);
    if (ir.kind !== "object") throw new Error("object");
    const address = ir.fields[0]!.spec;
    expect(address.kind).toBe("object");
    if (address.kind === "object") expect(address.fields).toHaveLength(2);
    const contacts = ir.fields[1]!.spec;
    expect(contacts.kind).toBe("array");
    if (contacts.kind === "array") expect(contacts.item.kind).toBe("object");
  });

  it("unknown types degrade to a string field with a todo", () => {
    const { ir } = parse(`interface T { when: SomeCustomType }`);
    if (ir.kind !== "object") throw new Error("object");
    const when = ir.fields[0]!.spec;
    expect(when.kind).toBe("string");
    expect(when.todo).toContain("SomeCustomType");
  });

  it("strips comments", () => {
    const { ir } = parse(`interface T {
      // the display name
      name: string; /* inline */ age: number;
    }`);
    if (ir.kind !== "object") throw new Error("object");
    expect(ir.fields.map((f) => f.name)).toEqual(["name", "age"]);
  });

  it("errors on no interface / empty body", () => {
    expect(parseTypeScript("const x = 1").ok).toBe(false);
    expect(parseTypeScript("interface T {}").ok).toBe(false);
  });
});
