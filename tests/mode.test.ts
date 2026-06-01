import { describe, expect, it } from "vitest";
import { shouldValidateOn } from "../src/core/mode";

describe("shouldValidateOn", () => {
  it("onSubmit mode validates on neither change nor blur", () => {
    expect(shouldValidateOn("change", "onSubmit", "onChange", false)).toBe(false);
    expect(shouldValidateOn("blur", "onSubmit", "onChange", false)).toBe(false);
  });

  it("onBlur mode validates on blur but not on change", () => {
    expect(shouldValidateOn("change", "onBlur", "onChange", false)).toBe(false);
    expect(shouldValidateOn("blur", "onBlur", "onChange", false)).toBe(true);
  });

  it("onChange mode validates on both change and blur", () => {
    expect(shouldValidateOn("change", "onChange", "onChange", false)).toBe(true);
    expect(shouldValidateOn("blur", "onChange", "onChange", false)).toBe(true);
  });

  it("all mode validates on both change and blur", () => {
    expect(shouldValidateOn("change", "all", "onChange", false)).toBe(true);
    expect(shouldValidateOn("blur", "all", "onChange", false)).toBe(true);
  });

  it("uses reValidateMode after a submit attempt", () => {
    expect(shouldValidateOn("change", "onSubmit", "onChange", true)).toBe(true);
    expect(shouldValidateOn("change", "onSubmit", "onSubmit", true)).toBe(false);
  });
});
