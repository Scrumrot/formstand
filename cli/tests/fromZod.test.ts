import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fromZod } from "../src/fromZod";
import { labelFromName } from "../src/ir";
import { profileSchema } from "./fixtures/profileSchema";

const req = { optional: false, nullable: false } as const;

describe("labelFromName", () => {
  it("title-cases camelCase and snake_case", () => {
    expect(labelFromName("firstName")).toBe("First Name");
    expect(labelFromName("first_name")).toBe("First Name");
    expect(labelFromName("zip")).toBe("Zip");
    expect(labelFromName("APIKey")).toBe("API Key");
  });
});

describe("fromZod", () => {
  it("walks the fixture schema into the IR", () => {
    expect(fromZod(profileSchema)).toEqual({
      kind: "object",
      ...req,
      fields: [
        {
          name: "firstName",
          label: "First Name",
          spec: { kind: "string", ...req },
        },
        {
          name: "age",
          label: "Age",
          spec: { kind: "number", optional: true, nullable: false },
        },
        {
          name: "bio",
          label: "Bio",
          spec: { kind: "string", optional: false, nullable: true },
        },
        {
          name: "isAdmin",
          label: "Is Admin",
          spec: { kind: "boolean", ...req },
        },
        {
          name: "role",
          label: "Role",
          spec: {
            kind: "enum",
            options: ["admin", "editor", "viewer"],
            ...req,
          },
        },
        {
          name: "birthday",
          label: "Birthday",
          spec: { kind: "date", optional: true, nullable: false },
        },
        {
          name: "address",
          label: "Address",
          spec: {
            kind: "object",
            ...req,
            fields: [
              {
                name: "street",
                label: "Street",
                spec: { kind: "string", ...req },
              },
              { name: "city", label: "City", spec: { kind: "string", ...req } },
              {
                name: "zip",
                label: "Zip",
                spec: { kind: "string", optional: true, nullable: false },
              },
            ],
          },
        },
        {
          name: "contacts",
          label: "Contacts",
          spec: {
            kind: "array",
            ...req,
            item: {
              kind: "object",
              ...req,
              fields: [
                {
                  name: "email",
                  label: "Email",
                  spec: { kind: "string", ...req },
                },
                {
                  name: "phone",
                  label: "Phone",
                  spec: { kind: "string", optional: false, nullable: true },
                },
                {
                  name: "kind",
                  label: "Kind",
                  spec: { kind: "enum", options: ["home", "work"], ...req },
                },
              ],
            },
          },
        },
      ],
    });
  });

  it("unwraps default as optional and pipes to their input side", () => {
    const ir = fromZod(
      z.object({
        theme: z.string().default("light"),
        count: z.string().pipe(z.transform((v) => Number(v))),
      }),
    );
    expect(ir).toEqual({
      kind: "object",
      ...req,
      fields: [
        {
          name: "theme",
          label: "Theme",
          spec: { kind: "string", optional: true, nullable: false },
        },
        {
          name: "count",
          label: "Count",
          spec: { kind: "string", ...req },
        },
      ],
    });
  });

  it("turns unions of string literals into enums", () => {
    const ir = fromZod(
      z.object({ kind: z.union([z.literal("a"), z.literal("b")]) }),
    );
    expect(ir).toEqual({
      kind: "object",
      ...req,
      fields: [
        {
          name: "kind",
          label: "Kind",
          spec: { kind: "enum", options: ["a", "b"], ...req },
        },
      ],
    });
  });

  it("falls back to string with a todo for unsupported kinds", () => {
    const ir = fromZod(z.object({ extras: z.record(z.string(), z.string()) }));
    if (ir.kind !== "object") throw new Error("expected object root");
    const extras = ir.fields[0];
    expect(extras?.spec.kind).toBe("string");
    expect(extras?.spec.todo).toContain("unsupported zod type");
  });

  it("degrades zod v4 getter-recursion to a todo instead of overflowing", () => {
    const category = z.object({
      name: z.string(),
      get subcategories() {
        return z.array(category);
      },
    });
    const ir = fromZod(category);
    if (ir.kind !== "object") throw new Error("expected object root");
    const sub = ir.fields.find((field) => field.name === "subcategories");
    if (sub?.spec.kind !== "array") throw new Error("expected array field");
    expect(sub.spec.item.kind).toBe("string");
    expect(sub.spec.item.todo).toContain("recursive schema");
  });

  it("caps unbounded nesting at the depth limit", () => {
    // Distinct schema objects at every level defeat the seen-set; the depth
    // limit must still stop the walk.
    const nested = (depth: number): z.ZodType =>
      depth === 0 ? z.string() : z.object({ next: nested(depth - 1) });
    expect(() => fromZod(nested(12))).not.toThrow();
    expect(JSON.stringify(fromZod(nested(12)))).toContain(
      "nesting depth limit reached",
    );
  });
});
