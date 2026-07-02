import { describe, expect, it } from "vitest";
import { shouldValidateOn } from "../src/core/mode";

describe("onTouched mode", () => {
  it("validates on blur regardless of touched", () => {
    expect(shouldValidateOn("blur", "onTouched", "onChange", false, false)).toBe(
      true,
    );
  });

  it("skips change validation for untouched fields", () => {
    expect(
      shouldValidateOn("change", "onTouched", "onChange", false, false),
    ).toBe(false);
  });

  it("validates on change once the field is touched", () => {
    expect(
      shouldValidateOn("change", "onTouched", "onChange", false, true),
    ).toBe(true);
  });

  it("defers to reValidateMode after a submit attempt", () => {
    expect(
      shouldValidateOn("change", "onTouched", "onChange", true, false),
    ).toBe(true);
  });
});

describe("all mode", () => {
  it("validates on both triggers", () => {
    expect(shouldValidateOn("change", "all", "onChange", false, false)).toBe(
      true,
    );
    expect(shouldValidateOn("blur", "all", "onChange", false, false)).toBe(
      true,
    );
  });
});
