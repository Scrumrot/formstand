import { describe, expect, it } from "vitest";
import { fromType } from "../src/fromType";
import { fromZod } from "../src/fromZod";
import { normalizeIr, tupleFixture, typeFixture } from "./helpers";
import { profileSchema } from "./fixtures/profileSchema";

describe("fromType", () => {
  it("produces the same IR as the mirrored zod fixture", () => {
    const { ir, typeName } = fromType(typeFixture, "Profile");
    expect(typeName).toBe("Profile");
    expect(normalizeIr(ir)).toEqual(normalizeIr(fromZod(profileSchema)));
  });

  it("picks the sole exported type when no name is given", () => {
    const { typeName } = fromType(typeFixture);
    expect(typeName).toBe("Profile");
  });

  it("fails with a friendly error listing the available exports", () => {
    expect(() => fromType(typeFixture, "Nope")).toThrowError(
      /no export named "Nope".*available: Profile/,
    );
  });

  it("reads tuples element-wise, skips methods, and never leaks Array.prototype", () => {
    const { ir } = fromType(tupleFixture, "WithTuple");
    if (ir.kind !== "object") throw new Error("expected object root");
    // "greet" is a method — not a form field at all.
    expect(ir.fields.map((field) => field.name)).toEqual([
      "name",
      "pair",
      "callables",
    ]);

    // [string, number] is a tuple of two positional element specs.
    const pair = ir.fields.find((field) => field.name === "pair");
    if (pair?.spec.kind !== "tuple") throw new Error("expected tuple");
    expect(pair.spec.elements.map((el) => el.kind)).toEqual(["string", "number"]);

    // The element type is itself callable → the whole element is a todo.
    const callables = ir.fields.find((field) => field.name === "callables");
    if (callables?.spec.kind !== "array") throw new Error("expected array");
    expect(callables.spec.item.kind).toBe("string");
    expect(callables.spec.item.todo).toContain("callable type");

    // The reproduced breakage: tuple fields used to walk into the object
    // branch and emit Array.prototype members as form fields. Walking the
    // element types (getTypeArguments), not the properties, keeps them out.
    const flat = JSON.stringify(ir);
    expect(flat).not.toContain('"push"');
    expect(flat).not.toContain('"concat"');
    expect(flat).not.toContain('"length"');
  });
});
