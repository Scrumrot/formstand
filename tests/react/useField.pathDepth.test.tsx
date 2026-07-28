import { renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { Form } from "../../src/core/createForm";
import { createFormContext } from "../../src/react/FormContext";
import { useField } from "../../src/react/useField";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";
import {
  TEN,
  TEN_ARRAY,
  deepInitialValues,
  deepSchema,
} from "../fixtures/deepSchema";

// The React mirror of tests/fieldPath.depth.test.ts: useForm infers D from
// `pathDepth` exactly like createForm, and useField/useFieldArray recover D
// from the form argument — so a widened form's deep paths bind through the
// hooks while overload order (typo blame on the path argument) is preserved.
// The ten-level pyramid lives in ../fixtures/deepSchema, shared with the
// core suite.

const initialValues = deepInitialValues;

describe("useForm + hooks with pathDepth", () => {
  it("useForm mirrors createForm's literal D inference", () => {
    const { result } = renderHook(() =>
      useForm(deepSchema, { initialValues, pathDepth: 12 }),
    );
    expectTypeOf(result.current).toEqualTypeOf<Form<typeof deepSchema, 12>>();
  });

  it("useForm rejects an out-of-range or non-literal pathDepth", () => {
    renderHook(() => {
      // @ts-expect-error — 26 is past the PathDepth range (0-25)
      useForm(deepSchema, { initialValues, pathDepth: 26 });
      // @ts-expect-error — a negative budget is not a PathDepth
      useForm(deepSchema, { initialValues, pathDepth: -1 });
      const widened: number = 12;
      // @ts-expect-error — a widened `number` variable is not a literal budget
      return useForm(deepSchema, { initialValues, pathDepth: widened });
    });
  });

  it("useForm rejects a UNION pathDepth at the call site", () => {
    renderHook(() => {
      const cond = Math.random() > 0.5;
      // @ts-expect-error — a union depth (9 | 12) is not a single literal
      return useForm(deepSchema, { initialValues, pathDepth: cond ? 12 : 9 });
    });
  });

  it("createFormContext constrains its explicit D like createForm's option", () => {
    // The context names D explicitly (no value argument to infer from), so
    // the PathDepth constraint is the only guard against an out-of-range or
    // widened budget silently unbinding the decrement table.
    // @ts-expect-error — 26 is past the PathDepth range (0-25)
    createFormContext<typeof deepSchema, 26>();
    // @ts-expect-error — a negative budget is not a PathDepth
    createFormContext<typeof deepSchema, -1>();
    // @ts-expect-error — a widened `number` D fails the constraint
    createFormContext<typeof deepSchema, number>();
    const ctx = createFormContext<typeof deepSchema, 12>();
    expect(typeof ctx.useFormContext).toBe("function");
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
      return useFieldArray(form, TEN_ARRAY);
    });
    expectTypeOf(result.current.items).toEqualTypeOf<readonly string[]>();
    expect(result.current.length).toBe(1);
  });

  it("widened and default forms do not interchange through Form<S, D>", () => {
    renderHook(() => {
      const wide = useForm(deepSchema, { initialValues, pathDepth: 12 });
      const dflt = useForm(deepSchema, { initialValues });
      // @ts-expect-error — Form<S, 12> is not assignable to Form<S, 9>
      const asDefault: Form<typeof deepSchema, 9> = wide;
      // @ts-expect-error — Form<S, 9> is not assignable to Form<S, 12>
      const asWide: Form<typeof deepSchema, 12> = dflt;
      expect(asDefault).toBe(wide);
      expect(asWide).toBe(dflt);
      return dflt;
    });
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
      typeof useFieldArray<typeof deepSchema, typeof TEN_ARRAY, 12>
    >;
    expectTypeOf<ThreeArgArray["items"]>().toEqualTypeOf<readonly string[]>();
    // ...and the explicit-D position is PathDepth-constrained (finding-2 pin;
    // instantiation expression only — nothing is called).
    // @ts-expect-error — 26 is past the PathDepth range (0-25)
    const useFieldAt26 = useField<typeof deepSchema, typeof TEN, 26>;
    expect(useFieldAt26).toBeTypeOf("function");
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
