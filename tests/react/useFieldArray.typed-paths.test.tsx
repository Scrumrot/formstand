import { renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  type FieldArrayFormApi,
  useFieldArray,
} from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  title: z.string(),
  users: z.array(z.object({ email: z.string(), admin: z.boolean() })),
  albums: z.array(
    z.object({
      name: z.string(),
      tracks: z.array(z.object({ title: z.string() })),
    }),
  ),
});

const initialValues = {
  title: "",
  users: [{ email: "a@a.com", admin: false }],
  albums: [{ name: "A", tracks: [{ title: "t1" }] }],
};

describe("useFieldArray typed paths", () => {
  it("infers the item type from a top-level array path", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return useFieldArray(form, "users");
    });
    expectTypeOf(result.current.items).toEqualTypeOf<
      readonly { email: string; admin: boolean }[]
    >();
    expectTypeOf(result.current.push)
      .parameter(0)
      .toEqualTypeOf<{ email: string; admin: boolean }>();
    expect(result.current.length).toBe(1);
  });

  it("infers the item type through an array-row template path", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      const index = 0;
      return useFieldArray(form, `albums.${index}.tracks`);
    });
    expectTypeOf(result.current.items).toEqualTypeOf<
      readonly { title: string }[]
    >();
    expect(result.current.items[0]?.title).toBe("t1");
  });

  it("binds a non-array path as never, so every write errors", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return useFieldArray(form, "title");
    });
    expectTypeOf(result.current.push).parameter(0).toEqualTypeOf<never>();
    // @ts-expect-error a scalar path has no item type to push
    const pushString = () => result.current.push("nope");
    expect(typeof pushString).toBe("function");
  });

  it("rejects a typo'd path against the FieldPath union", () => {
    renderHook(() => {
      const form = useForm(schema, { initialValues });
      // @ts-expect-error "usres" is not a path of the schema
      return useFieldArray(form, "usres");
    });
  });

  it("schema-less FieldFormApi forms keep the explicit item type", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      // The documented escape hatch for dynamic/untyped binding sites.
      const untyped: FieldArrayFormApi = form;
      return useFieldArray<{ email: string; admin: boolean }>(
        untyped,
        "users",
      );
    });
    expectTypeOf(result.current.items).toEqualTypeOf<
      readonly { email: string; admin: boolean }[]
    >();
    expect(result.current.length).toBe(1);
  });

  it("a path selector on a typed form returns unknown items (dynamic path)", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return useFieldArray(form, () => "users");
    });
    expectTypeOf(result.current.items).toEqualTypeOf<readonly unknown[]>();
    expect(result.current.length).toBe(1);
  });
});
