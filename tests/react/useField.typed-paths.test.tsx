import { renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  name: z.string(),
  age: z.number(),
  address: z.object({ city: z.string() }),
  users: z.array(z.object({ email: z.string() })),
});

describe("useField typed paths (B1)", () => {
  it("infers value type from a top-level path", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          name: "",
          age: 0,
          address: { city: "" },
          users: [],
        },
      });
      return useField(form, "name");
    });
    expectTypeOf(result.current.value).toEqualTypeOf<string>();
    expect(result.current.value).toBe("");
  });

  it("infers value type from a nested path", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          name: "",
          age: 0,
          address: { city: "NYC" },
          users: [],
        },
      });
      return useField(form, "address.city");
    });
    expectTypeOf(result.current.value).toEqualTypeOf<string>();
    expect(result.current.value).toBe("NYC");
  });

  it("infers value type through array index", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          name: "",
          age: 0,
          address: { city: "" },
          users: [{ email: "a@a.com" }],
        },
      });
      return useField(form, "users.0.email");
    });
    expectTypeOf(result.current.value).toEqualTypeOf<string>();
    expect(result.current.value).toBe("a@a.com");
  });

  it("rejects invalid paths at compile time", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "", age: 0, address: { city: "" }, users: [] },
      });
      // @ts-expect-error - "missing" is not a valid path
      useField(form, "missing");
      // @ts-expect-error - typo in path
      useField(form, "addres.city");
      return form;
    });
    expect(result.current).toBeDefined();
  });
});
