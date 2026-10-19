// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { useField } from "../../src/react/useField";
import { useFieldArray } from "../../src/react/useFieldArray";

// The October 2026 review's round B hook-side findings. The @ts-expect-error
// lines are enforced by `tsc --noEmit` over tests/.

describe("hooks read prototype-named paths as own keys", () => {
  // A schema MAY declare a field named after an Object.prototype member;
  // the typed path is then perfectly legal and the maps must not leak the
  // prototype's function as the field's error or touched flag.
  const schema = z.object({
    constructor: z.string(),
    toString: z.string(),
    tags: z.array(z.string()),
  });
  const initialValues = { constructor: "", toString: "", tags: [] };

  it("useField reports undefined/false for an untouched prototype-named field", () => {
    const form = createForm(schema, { initialValues });
    const { result } = renderHook(() => ({
      ctor: useField(form, "constructor"),
      str: useField(form, "toString"),
    }));
    expect(result.current.ctor.error).toBeUndefined();
    expect(result.current.ctor.touched).toBe(false);
    expect(result.current.ctor.isValidating).toBe(false);
    expect(result.current.str.error).toBeUndefined();
    expect(result.current.str.touched).toBe(false);
  });

  it("useFieldArray on a prototype-named array path reads no phantom error", () => {
    const arrays = z.object({ constructor: z.array(z.string()) });
    const form = createForm(arrays, { initialValues: { constructor: [] } });
    const { result } = renderHook(() => useFieldArray(form, "constructor"));
    expect(result.current.error).toBeUndefined();
    expect(result.current.firstError).toBeUndefined();
  });
});
