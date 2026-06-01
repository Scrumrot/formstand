import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useForm } from "../../src/react/useForm";
import { useFormError } from "../../src/react/useFormError";

const schema = z
  .object({ a: z.string(), b: z.string() })
  .refine((d) => d.a === d.b, { message: "must match" });

describe("useFormError", () => {
  it("returns undefined when there is no root-level error", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { a: "x", b: "x" } });
      return { form, err: useFormError(form) };
    });
    expect(result.current.err).toBeUndefined();
  });

  it("surfaces root-level refinement errors", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { a: "x", b: "y" } });
      return { form, err: useFormError(form) };
    });
    act(() => {
      result.current.form.validate();
    });
    expect(result.current.err).toEqual(["must match"]);
  });
});
