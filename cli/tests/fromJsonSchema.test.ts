import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fromJsonSchema } from "../src/fromJsonSchema";
import { fromZod } from "../src/fromZod";
import type { FieldSpec, NamedField } from "../src/ir";
import { fixturesDir, normalizeIr } from "./helpers";
import { profileSchema } from "./fixtures/profileSchema";

// The JSON Schema frontend: the same IR the zod and TS walks produce, from a
// parsed JSON document — a bare 2020-12 schema or an OpenAPI 3.x document
// with a selected component schema.

const loadFixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));

const OPTS = { source: "fixture.json", fallbackName: "Fixture" } as const;

const fieldOf = (ir: FieldSpec, name: string): NamedField => {
  if (ir.kind !== "object") throw new Error("expected object root");
  const field = ir.fields.find((candidate) => candidate.name === name);
  if (field === undefined) throw new Error(`no field "${name}"`);
  return field;
};

describe("fromJsonSchema — bare JSON Schema", () => {
  it("produces the same IR as the mirrored zod fixture, named by its title", () => {
    const { ir, schemaName } = fromJsonSchema(
      loadFixture("profileSchema.json"),
      OPTS,
    );
    expect(schemaName).toBe("Profile");
    expect(normalizeIr(ir)).toEqual(normalizeIr(fromZod(profileSchema)));
  });

  it("falls back to the caller's name when the schema has no title", () => {
    const { schemaName } = fromJsonSchema(
      { type: "object", properties: { a: { type: "string" } } },
      OPTS,
    );
    expect(schemaName).toBe("Fixture");
  });
});

describe("fromJsonSchema — OpenAPI documents", () => {
  const document = loadFixture("orderApi.json");
  const order = fromJsonSchema(document, { ...OPTS, select: "Order" });

  it("selects a component schema by bare name", () => {
    expect(order.schemaName).toBe("Order");
    expect(order.ir.kind).toBe("object");
  });

  it("reads required lists as the optionality boundary", () => {
    expect(fieldOf(order.ir, "id").spec.optional).toBe(false);
    expect(fieldOf(order.ir, "quantity").spec.optional).toBe(true);
  });

  it("captures primitive defaults and descriptions; drops non-primitive defaults loudly", () => {
    const quantity = fieldOf(order.ir, "quantity").spec;
    expect(quantity.kind).toBe("number");
    expect(quantity.defaultValue).toBe(1);
    expect(quantity.description).toBe("How many units");
    const channel = fieldOf(order.ir, "channel").spec;
    expect(channel.defaultValue).toBe("web");
    const risk = fieldOf(order.ir, "riskProfile").spec;
    expect(risk.defaultValue).toBeUndefined();
    expect(risk.droppedDefault).toBe(true);
  });

  it("resolves $ref chains and merges allOf object branches", () => {
    const customer = fieldOf(order.ir, "customer").spec;
    if (customer.kind !== "object") throw new Error("expected object");
    // Person's properties (via $ref inside allOf) plus the inline branch's.
    expect(customer.fields.map((field) => field.name)).toEqual([
      "name",
      "email",
      "vip",
    ]);
    expect(fieldOf(customer, "name").spec.optional).toBe(false);
    expect(fieldOf(customer, "vip").spec.optional).toBe(false);
    // format: email is a validation concern, not a control — stays a string.
    expect(fieldOf(customer, "email").spec.kind).toBe("string");
  });

  it("reads a discriminated oneOf as the IR union", () => {
    const payment = fieldOf(order.ir, "payment").spec;
    if (payment.kind !== "union") throw new Error("expected union");
    expect(payment.discriminant).toBe("method");
    expect(payment.variants.map((variant) => variant.tag)).toEqual([
      "card",
      "invoice",
    ]);
    // The discriminant binds as the common field, not a variant field.
    expect(payment.variants[0]?.fields.map((field) => field.name)).toEqual([
      "cardNumber",
    ]);
  });

  it("reads a oneOf of string consts as an enum", () => {
    const status = fieldOf(order.ir, "status").spec;
    if (status.kind !== "enum") throw new Error("expected enum");
    expect(status.options).toEqual(["draft", "placed", "shipped"]);
  });

  it("reads prefixItems as a tuple", () => {
    const coordinates = fieldOf(order.ir, "coordinates").spec;
    if (coordinates.kind !== "tuple") throw new Error("expected tuple");
    expect(coordinates.elements.map((element) => element.kind)).toEqual([
      "number",
      "number",
    ]);
  });

  it("honors both nullable dialects and uses titles as labels", () => {
    const notes = fieldOf(order.ir, "notes");
    expect(notes.spec.nullable).toBe(true);
    expect(notes.label).toBe("Internal notes");
    // OpenAPI 3.0's keyword spelling, honored wherever it appears.
    expect(fieldOf(order.ir, "legacyDiscount").spec.nullable).toBe(true);
    // oneOf [X, {type: "null"}] is 3.1's other spelling; date-time → date.
    const deliveredAt = fieldOf(order.ir, "deliveredAt").spec;
    expect(deliveredAt.kind).toBe("date");
    expect(deliveredAt.nullable).toBe(true);
  });

  it("degrades the unsupported shapes to named TODOs, never silently", () => {
    expect(fieldOf(order.ir, "parent").spec.todo).toContain("recursive");
    expect(fieldOf(order.ir, "external").spec.todo).toContain("external $ref");
    expect(fieldOf(order.ir, "attributes").spec.todo).toContain("record-like");
    expect(fieldOf(order.ir, "legacyTuple").spec.todo).toContain(
      "draft-07 tuple",
    );
  });

  it("selects through a full JSON pointer (an operation's request body)", () => {
    const { ir, schemaName } = fromJsonSchema(document, {
      ...OPTS,
      select:
        "#/paths/~1orders/post/requestBody/content/application~1json/schema",
    });
    // The pointer lands on a $ref node; the walk resolves it to Order. The
    // last pointer segment ("schema") is a name-shaped word, so it names the
    // result — callers passing operation pointers should usually add --name.
    expect(ir.kind).toBe("object");
    expect(fieldOf(ir, "id").spec.kind).toBe("string");
    expect(schemaName).toBe("schema");
  });

  it("requires --schema when the document declares several components", () => {
    expect(() => fromJsonSchema(document, OPTS)).toThrowError(
      /multiple component schemas.*Order, Customer, Person.*pick one with --schema/,
    );
  });

  it("fails a bad name with the available list, and a dangling pointer loudly", () => {
    expect(() =>
      fromJsonSchema(document, { ...OPTS, select: "Nope" }),
    ).toThrowError(/no schema named "Nope".*available: Order/);
    expect(() =>
      fromJsonSchema(document, { ...OPTS, select: "#/components/schemas/Nope" }),
    ).toThrowError(/does not resolve/);
  });

  it("refuses Swagger 2.0 documents with the conversion hint", () => {
    expect(() =>
      fromJsonSchema({ swagger: "2.0", info: {} }, OPTS),
    ).toThrowError(/Swagger 2\.0.*convert it to OpenAPI 3/);
  });
});
