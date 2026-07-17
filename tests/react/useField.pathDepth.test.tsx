import { renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { Form } from "../../src/core/createForm";
import { useField } from "../../src/react/useField";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

// The React mirror of tests/fieldPath.depth.test.ts: useForm infers D from
// `pathDepth` exactly like createForm, and useField/useFieldArray recover D
// from the form argument — so a widened form's deep paths bind through the
// hooks while overload order (typo blame on the path argument) is preserved.

const deepSchema = z.object({
  a: z.object({
    b: z.object({
      c: z.object({
        d: z.object({
          e: z.object({
            f: z.object({
              g: z.object({
                h: z.object({
                  i: z.object({ j: z.string(), tags: z.array(z.string()) }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
});

const initialValues: z.input<typeof deepSchema> = {
  a: {
    b: {
      c: { d: { e: { f: { g: { h: { i: { j: "leaf", tags: ["t"] } } } } } } },
    },
  },
};

const TEN = "a.b.c.d.e.f.g.h.i.j" as const;

describe("useForm + hooks with pathDepth", () => {
  it("useForm mirrors createForm's literal D inference", () => {
    const { result } = renderHook(() =>
      useForm(deepSchema, { initialValues, pathDepth: 12 }),
    );
    expectTypeOf(result.current).toEqualTypeOf<Form<typeof deepSchema, 12>>();
  });

  it("useField binds a 10-segment path on a pathDepth: 12 form", () => {
    const { result } = renderHook(() => {
      const form = useForm(deepSchema, { initialValues, pathDepth: 12 });
      return useField(form, TEN);
    });
    expectTypeOf(result.current.value).toEqualTypeOf<string>();
    expect(result.current.value).toBe("leaf");
  });

  it("useField rejects the same path on a default-depth form", () => {
    renderHook(() => {
      const form = useForm(deepSchema, { initialValues });
      // @ts-expect-error — 10 segments exceed the default budget of 9
      return useField(form, TEN);
    });
  });

  it("useFieldArray infers the item type through a widened deep path", () => {
    const { result } = renderHook(() => {
      const form = useForm(deepSchema, { initialValues, pathDepth: 12 });
      return useFieldArray(form, "a.b.c.d.e.f.g.h.i.tags");
    });
    expectTypeOf(result.current.items).toEqualTypeOf<readonly string[]>();
    expect(result.current.length).toBe(1);
  });

  it("explicit instantiation keeps its pre-pathDepth arity (D last, defaulted)", () => {
    // The two-type-arg form (schema, path) that existed before `pathDepth`
    // must keep compiling — D sits last with a default, and the selector
    // overloads stay at one type parameter so instantiation expressions
    // don't check the path against D's constraint.
    type TwoArgField = ReturnType<typeof useField<typeof deepSchema, "a">>;
    expectTypeOf<TwoArgField["value"]>().toEqualTypeOf<
      z.input<typeof deepSchema>["a"]
    >();
    type TwoArgArray = ReturnType<typeof useFieldArray<typeof deepSchema, "a">>;
    expectTypeOf<TwoArgArray["items"]>().toEqualTypeOf<readonly never[]>();
    // The widened budget is reachable explicitly as the LAST argument.
    type ThreeArgField = ReturnType<
      typeof useField<typeof deepSchema, typeof TEN, 12>
    >;
    expectTypeOf<ThreeArgField["value"]>().toEqualTypeOf<string>();
    type ThreeArgArray = ReturnType<
      typeof useFieldArray<typeof deepSchema, "a.b.c.d.e.f.g.h.i.tags", 12>
    >;
    expectTypeOf<ThreeArgArray["items"]>().toEqualTypeOf<readonly string[]>();
  });

  it("typo blame lands on the path argument, widened form included", () => {
    renderHook(() => {
      const form = useForm(deepSchema, { initialValues, pathDepth: 12 });
      // @ts-expect-error — "a.b.typo" is not a path of the schema
      useField(form, "a.b.typo");
      // @ts-expect-error — "a.typo" is not an array path either
      useFieldArray(form, "a.typo");
      return form;
    });
  });
});
