import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  users: z.array(z.object({ email: z.string() })).min(1, "need at least one"),
});

describe("useFieldArray.error", () => {
  it("surfaces array-level errors at the array path", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { users: [] } });
      return { form, users: useFieldArray(form, "users") };
    });

    expect(result.current.users.error).toBeUndefined();
    act(() => {
      result.current.form.validate();
    });
    expect(result.current.users.error).toEqual(["need at least one"]);
  });

  it("clears the array-level error once the array is populated and re-validated", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { users: [] } });
      return { form, users: useFieldArray(form, "users") };
    });

    act(() => {
      result.current.form.validate();
    });
    expect(result.current.users.error).toBeDefined();

    act(() => {
      result.current.users.push({ email: "a@a.com" });
      result.current.form.validate();
    });
    expect(result.current.users.error).toBeUndefined();
  });
});
