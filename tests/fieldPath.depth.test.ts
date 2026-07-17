import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { FieldPath, FieldValue } from "../src/core/fieldPath";
import { type Form, createForm } from "../src/core/createForm";

// The typed-path depth budget: D counts SEGMENTS (one per dot-separated
// key/index), defaults to 9, and is configurable per form via createForm's
// type-level-only `pathDepth` option. These tests pin both sides of the
// default boundary and the widened budget.

// Ten levels of object nesting: "a...i" is a 9-segment path (at the default
// limit), "a...i.j" is 10 (past it).
type Deep = Readonly<{
  a: {
    b: {
      c: { d: { e: { f: { g: { h: { i: { j: string; k: number } } } } } } };
    };
  };
}>;

const NINE = "a.b.c.d.e.f.g.h.i" as const;
const TEN = "a.b.c.d.e.f.g.h.i.j" as const;

describe("FieldPath default depth budget (9 segments)", () => {
  it("binds a 9-segment path and rejects a 10-segment one", () => {
    expectTypeOf<typeof NINE>().toMatchTypeOf<FieldPath<Deep>>();
    expectTypeOf<FieldValue<Deep, typeof NINE>>().toEqualTypeOf<{
      j: string;
      k: number;
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
});

const deepSchema = z.object({
  a: z.object({
    b: z.object({
      c: z.object({
        d: z.object({
          e: z.object({
            f: z.object({
              g: z.object({
                h: z.object({
                  i: z.object({ j: z.string(), k: z.number() }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
});

const deepValues: z.input<typeof deepSchema> = {
  a: {
    b: {
      c: { d: { e: { f: { g: { h: { i: { j: "leaf", k: 1 } } } } } } },
    },
  },
};

describe("createForm pathDepth", () => {
  it("defaults to 9: a 9-segment path binds, a 10-segment one is an error", () => {
    const form = createForm(deepSchema, { initialValues: deepValues });
    expectTypeOf(form).toEqualTypeOf<Form<typeof deepSchema, 9>>();
    expect(form.getField(NINE)).toEqual({ j: "leaf", k: 1 });
    // @ts-expect-error — 10 segments exceed the default depth budget
    form.getField(TEN);
    // @ts-expect-error — writes are capped the same way
    form.setValue(TEN, "x");
  });

  it("pathDepth: 12 infers D as the LITERAL 12 and widens the union", () => {
    const form = createForm(deepSchema, {
      initialValues: deepValues,
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

  it("runtime ignores pathDepth entirely (type-level only)", () => {
    const narrow = createForm(deepSchema, {
      initialValues: deepValues,
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
      initialValues: deepValues,
      pathDepth: 12,
    });
    // @ts-expect-error — "a.b.typo" is not a path of the schema
    form.getField("a.b.typo");
    // @ts-expect-error — "naem" is not a path
    form.setTouched("naem");
  });
});
