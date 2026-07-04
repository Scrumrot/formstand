import { describe, expect, it } from "vitest";
import { fromType } from "../src/fromType";
import { fromZod } from "../src/fromZod";
import { normalizeIr, typeFixture } from "./helpers";
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

  it("fails with a friendly error for a missing export", () => {
    expect(() => fromType(typeFixture, "Nope")).toThrowError(
      /no export named "Nope"/,
    );
  });
});
