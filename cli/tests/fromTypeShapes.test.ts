import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import { fromType } from "../src/fromType";
import type { FieldSpec, NamedField } from "../src/ir";
import {
  captureStderr,
  fixturesDir,
  freshTmpDir,
  typecheckDiagnostics,
} from "./helpers";

// Type-mode shapes from the review: recursion has a guard (not only the
// depth budget), `Function` is callable, intersections and discriminated
// unions walk like their zod and JSON Schema counterparts, numeric-literal
// unions and mixed index signatures name their reason, and a const picked
// with --type is an operator error rather than an "any" form.

const recursiveFixture = path.join(fixturesDir, "recursiveType.ts");
const compositeFixture = path.join(fixturesDir, "compositeType.ts");

const fieldOf = (ir: FieldSpec, name: string): NamedField => {
  if (ir.kind !== "object") throw new Error("expected object root");
  const field = ir.fields.find((candidate) => candidate.name === name);
  if (field === undefined) throw new Error(`no field "${name}"`);
  return field;
};

const countNodes = (spec: FieldSpec): number => {
  switch (spec.kind) {
    case "object":
      return 1 + spec.fields.reduce((n, f) => n + countNodes(f.spec), 0);
    case "array":
      return 1 + countNodes(spec.item);
    case "tuple":
      return 1 + spec.elements.reduce((n, el) => n + countNodes(el), 0);
    case "union":
      return (
        1 +
        spec.variants.reduce(
          (n, v) => n + v.fields.reduce((m, f) => m + countNodes(f.spec), 0),
          0,
        )
      );
    default:
      return 1;
  }
};

describe("fromType recursion guard", () => {
  it("a self-referential type is cut at the repeat with a TODO, not expanded to the budget", () => {
    const { ir } = fromType(recursiveFixture, "Tree");
    // Before the guard this walked to the nesting budget: 6142 nodes for a
    // three-member tree.
    expect(countNodes(ir)).toBeLessThan(10);
    const left = fieldOf(ir, "left").spec;
    expect(left.kind).toBe("string");
    expect(left.optional).toBe(true);
    expect(left.todo).toContain("recursive type");
    expect(fieldOf(ir, "right").spec.todo).toContain("recursive type");
    expect(fieldOf(ir, "value").spec).toEqual({
      kind: "string",
      optional: false,
      nullable: false,
    });
  });

  it("mutual recursion through an array is cut where the type repeats", () => {
    const { ir } = fromType(recursiveFixture, "Folder");
    const entries = fieldOf(ir, "entries").spec;
    if (entries.kind !== "array") throw new Error("expected array");
    if (entries.item.kind !== "object") throw new Error("expected object rows");
    const folder = entries.item.fields.find((f) => f.name === "folder");
    expect(folder?.spec.kind).toBe("string");
    expect(folder?.spec.todo).toContain("recursive type");
    expect(countNodes(ir)).toBeLessThan(10);
  });

  it("the global Function type degrades like a method, without walking Function.prototype", () => {
    const { ir } = fromType(recursiveFixture, "WithFunction");
    const fn = fieldOf(ir, "fn").spec;
    expect(fn.kind).toBe("string");
    expect(fn.todo).toContain("callable type");
    expect(fieldOf(ir, "handler").spec.todo).toContain("callable type");
    const flat = JSON.stringify(ir);
    expect(flat).not.toContain('"apply"');
    expect(flat).not.toContain('"bind"');
    expect(flat).not.toContain("hasInstance");
  });
});

describe("fromType intersections and unions", () => {
  it("an intersection walks to the merged member set", () => {
    const { ir } = fromType(compositeFixture, "Both");
    if (ir.kind !== "object") throw new Error("expected object root");
    expect(ir.todo).toBeUndefined();
    expect(ir.fields.map((f) => f.name).sort()).toEqual([
      "createdAt",
      "id",
      "tags",
      "title",
    ]);
    expect(fieldOf(ir, "createdAt").spec.kind).toBe("date");
    expect(fieldOf(ir, "tags").spec.optional).toBe(true);
  });

  it("members disagreeing on a key keep the later type and leave a TODO", () => {
    const { ir } = fromType(compositeFixture, "Conflict");
    const size = fieldOf(ir, "size").spec;
    expect(size.kind).toBe("number");
    expect(size.todo).toContain('intersection members disagree on "size"');
    expect(fieldOf(ir, "weight").spec.todo).toBeUndefined();
    expect(fieldOf(ir, "height").spec.kind).toBe("number");
  });

  it("a union of object types sharing a string-literal key is the IR union", () => {
    const { ir } = fromType(compositeFixture, "Checkout");
    const payment = fieldOf(ir, "payment").spec;
    if (payment.kind !== "union") throw new Error("expected union");
    expect(payment.discriminant).toBe("method");
    expect(payment.optional).toBe(false);
    expect(payment.variants.map((v) => v.tag).sort()).toEqual(["bank", "card"]);
    const card = payment.variants.find((v) => v.tag === "card");
    expect(card?.label).toBe("Card");
    expect(card?.fields.map((f) => f.name)).toEqual(["cardNumber", "expiry"]);
    expect(card?.fields.find((f) => f.name === "expiry")?.spec.optional).toBe(
      true,
    );
    // The discriminant is not repeated among the variant fields.
    expect(card?.fields.some((f) => f.name === "method")).toBe(false);
    const refund = fieldOf(ir, "refund").spec;
    expect(refund.kind).toBe("union");
    expect(refund.optional).toBe(true);
  });

  it("object unions without a shared literal key, and numeric-literal unions, name their reason", () => {
    const { ir } = fromType(compositeFixture, "Checkout");
    const untagged = fieldOf(ir, "untagged").spec;
    expect(untagged.kind).toBe("string");
    expect(untagged.todo).toContain("no shared string-literal discriminant");
    const rating = fieldOf(ir, "rating").spec;
    expect(rating.kind).toBe("string");
    expect(rating.todo).toContain("numeric literals");
    expect(rating.todo).toContain("string-only");
    expect(rating.todo).not.toContain("unsupported union type");
  });

  it("the generated schema and component for a type-mode union typecheck", async () => {
    const dir = freshTmpDir("fromtype-union-cli");
    const out = path.join(dir, "CheckoutForm.tsx");
    const text = await captureStderr(async () => {
      expect(
        await main([compositeFixture, "--type", "Checkout", "--out", out]),
      ).toBe(0);
    });
    const schemaOut = path.join(dir, "checkoutSchema.ts");
    const schema = fs.readFileSync(schemaOut, "utf8");
    expect(schema).toContain('z.discriminatedUnion("method"');
    expect(text).toContain('warning: field "rating"');
    expect(text).toContain('warning: field "untagged"');
    expect(typecheckDiagnostics([schemaOut, out])).toEqual([]);
  });
});

describe("fromType operator errors and mixed index signatures", () => {
  it("--type naming a const or a function is an error that names the symbol kind", () => {
    expect(() => fromType(compositeFixture, "someConst")).toThrowError(
      /"someConst" in .* is a variable, not a type or interface/,
    );
    expect(() => fromType(compositeFixture, "aFunction")).toThrowError(
      /"aFunction" in .* is a variable, not a type or interface/,
    );
  });

  it("an index signature beside named members keeps the members and leaves a TODO", async () => {
    const { ir } = fromType(compositeFixture, "Mixed");
    if (ir.kind !== "object") throw new Error("expected object root");
    expect(ir.fields.map((f) => f.name)).toEqual(["name"]);
    expect(ir.todo).toContain("index signature");
    // Nested, the TODO sits on the section's spec, named by its path.
    const nested = fromType(compositeFixture, "HasMixed").ir;
    const extras = fieldOf(nested, "extras").spec;
    expect(extras.kind).toBe("object");
    expect(extras.todo).toContain("index signature");
    // Mirrored on stderr like every other walker TODO, and kept in the
    // generated schema above the object it describes.
    const dir = freshTmpDir("fromtype-mixed-cli");
    const out = path.join(dir, "MixedForm.tsx");
    const text = await captureStderr(async () => {
      expect(
        await main([compositeFixture, "--type", "HasMixed", "--out", out]),
      ).toBe(0);
    });
    expect(text).toContain('warning: field "extras": index signature');
    const schemaOut = path.join(dir, "hasMixedSchema.ts");
    expect(fs.readFileSync(schemaOut, "utf8")).toContain("// TODO: index signature");
    expect(typecheckDiagnostics([schemaOut, out])).toEqual([]);
  });
});
