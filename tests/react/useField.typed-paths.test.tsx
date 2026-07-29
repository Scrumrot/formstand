import { renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { type FieldFormApi, useField } from "../../src/react/useField";
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

  it("template-literal array paths stay typed", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          name: "",
          age: 0,
          address: { city: "" },
          users: [{ email: "a@a.com" }],
        },
      });
      const i = 0;
      return useField(form, `users.${i}.email`);
    });
    expectTypeOf(result.current.value).toEqualTypeOf<string>();
    expect(result.current.value).toBe("a@a.com");
  });

  it("the selector-path overload returns unknown", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          name: "",
          age: 0,
          address: { city: "NYC" },
          users: [],
        },
      });
      return useField(form, () => "address.city");
    });
    expectTypeOf(result.current.value).toEqualTypeOf<unknown>();
    expect(result.current.value).toBe("NYC");
  });

  it("explicit type arguments on a schema-typed form are a readable compile error", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "", age: 0, address: { city: "" }, users: [] },
      });
      // The trap-guard overload blames the PATH argument with instructions —
      // the first reported overload error reads:
      //   Argument of type '"name"' is not assignable to parameter of type
      //   '"Remove the explicit type argument: a schema-typed form infers
      //   the value type from the path"'.
      // (Not the old baffling `schema?: undefined` brand mismatch.)
      // @ts-expect-error — explicit generics on a Form select the trap-guard
      useField<string>(form, "name");
      // @ts-expect-error — a values-shaped explicit argument is the same trap
      useField<{ name: string }>(form, "name");
      return form;
    });
    expect(result.current).toBeDefined();
  });

  it("a bare FieldFormApi keeps string paths with an explicit value type", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "Tim", age: 0, address: { city: "" }, users: [] },
      });
      const bare: FieldFormApi = form;
      return useField<string>(bare, ["na", "me"].join(""));
    });
    expectTypeOf(result.current.value).toEqualTypeOf<string>();
    expect(result.current.value).toBe("Tim");
  });
});
