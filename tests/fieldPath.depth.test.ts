import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { FieldPath, FieldValue, PathDepth } from "../src/core/fieldPath";
import { type Form, createForm } from "../src/core/createForm";
import { persistForm } from "../src/core/persist";
import {
  NINE,
  TEN,
  deepInitialValues,
  deepSchema,
} from "./fixtures/deepSchema";

// The typed-path depth budget: D counts SEGMENTS (one per dot-separated
// key/index), defaults to 9, and is configurable per form via createForm's
// type-level-only `pathDepth` option. These tests pin both sides of the
// default boundary, the widened budget, the PathDepth option constraint,
// and the non-literal-D fallback. The ten-level pyramid lives in
// ./fixtures/deepSchema, shared with the React mirror suite.

type Deep = z.input<typeof deepSchema>;

describe("FieldPath default depth budget (9 segments)", () => {
  it("binds a 9-segment path and rejects a 10-segment one", () => {
    expectTypeOf<typeof NINE>().toMatchTypeOf<FieldPath<Deep>>();
    expectTypeOf<FieldValue<Deep, typeof NINE>>().toEqualTypeOf<{
      j: string;
      k: number;
      tags: string[];
    }>();
    type TenBinds = typeof TEN extends FieldPath<Deep> ? true : false;
    expectTypeOf<TenBinds>().toEqualTypeOf<false>();
  });

  it("widens past 9 segments with an explicit D (segments, not steps)", () => {
    expectTypeOf<typeof TEN>().toMatchTypeOf<FieldPath<Deep, 12>>();
    // D = 1 admits exactly single-segment paths — D counts segments.
    type P1 = FieldPath<Deep, 1>;
    expectTypeOf<P1>().toEqualTypeOf<"a">();
  });

  it("a non-literal D falls back to the default union, not a wide-open one", () => {
    // A widened `number` D (an options object built separately, a path type
    // computed in a helper that lost the literal) must not silently build
    // the ~25-level union — it degrades to the default budget instead.
    // (Form<S, number> itself no longer compiles — Form's D is constrained
    // to PathDepth — so this pin covers direct FieldPath users only.)
    expectTypeOf<FieldPath<Deep, number>>().toEqualTypeOf<FieldPath<Deep>>();
    type TenBindsWide = typeof TEN extends FieldPath<Deep, number>
      ? true
      : false;
    expectTypeOf<TenBindsWide>().toEqualTypeOf<false>();
  });

  it("a UNION D falls back to the default budget, not the union's max", () => {
    // Prev distributes over unions, so an unguarded 9 | 12 (or PathDepth
    // itself) would recurse to the union's max — NormalizeDepth collapses
    // any multi-member D to the default budget instead.
    type TenBindsUnderPathDepth = typeof TEN extends FieldPath<Deep, PathDepth>
      ? true
      : false;
    expectTypeOf<TenBindsUnderPathDepth>().toEqualTypeOf<false>();
    type TenBindsUnder912 = typeof TEN extends FieldPath<Deep, 9 | 12>
      ? true
      : false;
    expectTypeOf<TenBindsUnder912>().toEqualTypeOf<false>();
    // A SINGLE in-range literal is preserved untouched.
    type TenBindsUnder12 = typeof TEN extends FieldPath<Deep, 12>
      ? true
      : false;
    expectTypeOf<TenBindsUnder12>().toEqualTypeOf<true>();
  });

  it("an out-of-range literal D falls back instead of no-op decrementing", () => {
    // 26 is past the Prev table (Prev[26] is undefined, so the decrement
    // would silently stop) and -1 was never a budget; both normalize to the
    // default 9 — no unbounded recursion, no TS2615 blamed on the tree type.
    type TenBindsUnder26 = typeof TEN extends FieldPath<Deep, 26>
      ? true
      : false;
    expectTypeOf<TenBindsUnder26>().toEqualTypeOf<false>();
    type TenBindsUnderNeg = typeof TEN extends FieldPath<Deep, -1>
      ? true
      : false;
    expectTypeOf<TenBindsUnderNeg>().toEqualTypeOf<false>();
    expectTypeOf<FieldPath<Deep, 26>>().toEqualTypeOf<FieldPath<Deep>>();
  });
});

describe("createForm pathDepth", () => {
  it("defaults to 9: a 9-segment path binds, a 10-segment one is an error", () => {
    const form = createForm(deepSchema, { initialValues: deepInitialValues });
    expectTypeOf(form).toEqualTypeOf<Form<typeof deepSchema, 9>>();
    expect(form.getField(NINE)).toEqual({ j: "leaf", k: 1, tags: ["t"] });
    // @ts-expect-error — 10 segments exceed the default depth budget
    form.getField(TEN);
    // @ts-expect-error — writes are capped the same way
    form.setValue(TEN, "x");
  });

  it("pathDepth: 12 infers D as the LITERAL 12 and widens the union", () => {
    const form = createForm(deepSchema, {
      initialValues: deepInitialValues,
      pathDepth: 12,
    });
    expectTypeOf(form).toEqualTypeOf<Form<typeof deepSchema, 12>>();
    // The 10-segment path binds with the correct FieldValue type...
    expectTypeOf(form.getField(TEN)).toEqualTypeOf<string>();
    expect(form.getField(TEN)).toBe("leaf");
    expectTypeOf(form.getField("a.b.c.d.e.f.g.h.i.k")).toEqualTypeOf<number>();
    // ...writes included.
    form.setValue(TEN, "renamed");
    expect(form.getField(TEN)).toBe("renamed");
    // @ts-expect-error — wrong value type at the deep path
    form.setValue(TEN, 42);
    form.setTouched(TEN);
    form.validateField(TEN);
  });

  it("rejects an out-of-range or non-literal pathDepth at the call site", () => {
    createForm(deepSchema, {
      initialValues: deepInitialValues,
      // @ts-expect-error — 26 is past the PathDepth range (0-25)
      pathDepth: 26,
    });
    createForm(deepSchema, {
      initialValues: deepInitialValues,
      // @ts-expect-error — a negative budget is not a PathDepth
      pathDepth: -1,
    });
    const widened: number = 12;
    createForm(deepSchema, {
      initialValues: deepInitialValues,
      // @ts-expect-error — a widened `number` variable is not a literal budget
      pathDepth: widened,
    });
  });

  it("rejects a UNION pathDepth at the call site", () => {
    // `cond ? 12 : 9` would infer D = 9 | 12 — a budget assignable to
    // neither Form<S, 9> nor Form<S, 12>. The option's IsUnion intersection
    // makes it a call-site error instead of minting an unusable Form type.
    const cond = Math.random() > 0.5;
    createForm(deepSchema, {
      initialValues: deepInitialValues,
      // @ts-expect-error — a union depth is not a single literal budget
      pathDepth: cond ? 12 : 9,
    });
  });

  it("Form and persistForm reject an out-of-range or widened D", () => {
    // Finding-2 regression pins: every generic surface carrying D constrains
    // it to PathDepth, Form itself included — Form<S, 26> / Form<S, number>
    // are compile errors, not silently-unbounded budgets.
    // @ts-expect-error — 26 is past the PathDepth range (0-25)
    const formAt26: Form<typeof deepSchema, 26> | null = null;
    // @ts-expect-error — a widened `number` D fails the PathDepth constraint
    const formAtNumber: Form<typeof deepSchema, number> | null = null;
    // @ts-expect-error — negative budgets were never PathDepth members
    const formAtNeg: Form<typeof deepSchema, -1> | null = null;
    // Instantiation expression only — no call, no storage side effects.
    // @ts-expect-error — persistForm's explicit-D position is constrained too
    const persistAt26 = persistForm<typeof deepSchema, 26>;
    expect([formAt26, formAtNumber, formAtNeg]).toEqual([null, null, null]);
    expect(persistAt26).toBeTypeOf("function");
    const form = createForm(deepSchema, { initialValues: deepInitialValues });
    expectTypeOf(form).toEqualTypeOf<Form<typeof deepSchema, 9>>();
  });

  it("Form<S, 12> and Form<S, 9> are deliberately not interchangeable", () => {
    const wide = createForm(deepSchema, {
      initialValues: deepInitialValues,
      pathDepth: 12,
    });
    const dflt = createForm(deepSchema, { initialValues: deepInitialValues });
    // @ts-expect-error — a widened form is not assignable to a default-depth one
    const asDefault: Form<typeof deepSchema, 9> = wide;
    // @ts-expect-error — nor is a default-depth form assignable to a widened one
    const asWide: Form<typeof deepSchema, 12> = dflt;
    expect(asDefault).toBe(wide);
    expect(asWide).toBe(dflt);
  });

  it("runtime ignores pathDepth entirely (type-level only)", () => {
    const narrow = createForm(deepSchema, {
      initialValues: deepInitialValues,
      pathDepth: 2,
    });
    // Past the typed union, but the runtime walks any depth (the documented
    // cast-at-the-boundary escape hatch).
    const path = TEN as unknown as FieldPath<z.input<typeof deepSchema>, 2>;
    expect(narrow.getField(path)).toBe("leaf");
    expect("~pathDepth" in narrow).toBe(false);
  });

  it("typo blame still lands on the path argument", () => {
    const form = createForm(deepSchema, {
      initialValues: deepInitialValues,
      pathDepth: 12,
    });
    // @ts-expect-error — "a.b.typo" is not a path of the schema
    form.getField("a.b.typo");
    // @ts-expect-error — "naem" is not a path
    form.setTouched("naem");
  });
});
