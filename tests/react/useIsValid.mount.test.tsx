import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useForm } from "../../src/react/useForm";
import { useIsValid } from "../../src/react/useFormFlags";

const schema = z.object({
  name: z.string().min(2, "min 2 chars"),
});

describe("useIsValid + validateOnMount", () => {
  it("reads as valid on mount when validateOnMount is off, even for bad values", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { name: "" } });
      return useIsValid(form);
    });
    expect(result.current).toBe(true);
  });

  it("reads as invalid on mount when validateOnMount checks bad values", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "" },
        validateOnMount: true,
      });
      return useIsValid(form);
    });
    expect(result.current).toBe(false);
  });

  it("reads as valid on mount when validateOnMount checks good values", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "ok" },
        validateOnMount: true,
      });
      return useIsValid(form);
    });
    expect(result.current).toBe(true);
  });
});
