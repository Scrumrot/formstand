import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

describe("array op on non-array value", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns and skips when the path is not an array", () => {
    const form = createForm(
      z.object({ name: z.string() }),
      { initialValues: { name: "Tim" } },
    );
    form.arrayPush("name", "x");
    expect(console.warn).toHaveBeenCalledOnce();
    expect(form.getState().values).toEqual({ name: "Tim" });
  });
});
