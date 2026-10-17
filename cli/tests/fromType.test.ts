import { describe, expect, it } from "vitest";
import { fromType } from "../src/fromType";
import { fromZod } from "../src/fromZod";
import path from "node:path";
import { fixturesDir, normalizeIr, tupleFixture, typeFixture } from "./helpers";
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

  it("reads tuples element-wise, keeps methods as TODOs, and never leaks Array.prototype", () => {
    const { ir } = fromType(tupleFixture, "WithTuple");
    if (ir.kind !== "object") throw new Error("expected object root");
    // "greet" is a method: not a control, but not dropped either. It stays
    // in the IR as the string-plus-TODO placeholder so the generated
    // schema keeps every key of the type it mirrors.
    expect(ir.fields.map((field) => field.name)).toEqual([
      "name",
      "pair",
      "greet",
      "callables",
    ]);
    const greet = ir.fields.find((field) => field.name === "greet");
    expect(greet?.spec.kind).toBe("string");
    expect(greet?.spec.todo).toContain("callable type");

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

describe("fromType degradations that used to be silent", () => {
  const recordFixture = path.join(fixturesDir, "recordType.ts");

  it("a function-typed member becomes the string-plus-TODO placeholder", () => {
    const { ir } = fromType(recordFixture, "WithRecord");
    if (ir.kind !== "object") throw new Error("expected object root");
    const onChange = ir.fields.find((field) => field.name === "onChange");
    expect(onChange?.spec.kind).toBe("string");
    expect(onChange?.spec.todo).toContain("callable type");
  });

  it("an index-signature-only object is a TODO, not an empty section", () => {
    const { ir } = fromType(recordFixture, "WithRecord");
    if (ir.kind !== "object") throw new Error("expected object root");
    const scores = ir.fields.find((field) => field.name === "scores");
    expect(scores?.spec.kind).toBe("string");
    expect(scores?.spec.todo).toContain("record type");
    expect(scores?.spec.todo).toContain("no fixed keys");
    // The inline spelling degrades the same way, and keeps its optionality.
    const labels = ir.fields.find((field) => field.name === "labels");
    expect(labels?.spec.kind).toBe("string");
    expect(labels?.spec.optional).toBe(true);
    expect(labels?.spec.todo).toContain("record type");
    // A real object with named members still walks to a section.
    const { ir: profile } = fromType(typeFixture, "Profile");
    if (profile.kind !== "object") throw new Error("expected object root");
    expect(profile.fields.some((field) => field.spec.kind === "object")).toBe(true);
  });
});
