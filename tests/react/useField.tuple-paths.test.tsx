import { renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";
import { useVariantField } from "../../src/react/useVariantField";

// Regression (2026-09 library review, types #1-#3): tuples fell into the
// generic-array arms of FieldPathRec and UnionValueAt, which union every
// element — so nested paths under heterogeneous tuples were REJECTED,
// out-of-range indices ("coord.5") ACCEPTED with a lying element type, and
// a union below a tuple position unbindable. The tuple arms resolve
// positions by their literal indices.
const schema = z.object({
  coord: z.tuple([z.number(), z.number()]),
  hetero: z.tuple([z.object({ a: z.string() }), z.object({ b: z.number() })]),
  wrap: z.tuple([
    z.object({
      pay: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("card"), cardNumber: z.string() }),
        z.object({ kind: z.literal("paypal"), email: z.string() }),
      ]),
    }),
    z.object({ other: z.number() }),
  ]),
});

const initialValues = {
  coord: [1, 2] as [number, number],
  hetero: [{ a: "x" }, { b: 3 }] as [{ a: string }, { b: number }],
  wrap: [
    { pay: { kind: "card" as const, cardNumber: "" } },
    { other: 0 },
  ] as never,
};

describe("tuple paths resolve positionally", () => {
  it("nested paths under heterogeneous tuples bind with each position's type", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return {
        a: useField(form, "hetero.0.a"),
        b: useField(form, "hetero.1.b"),
        first: useField(form, "coord.0"),
      };
    });
    expectTypeOf(result.current.a.value).toEqualTypeOf<string>();
    expectTypeOf(result.current.b.value).toEqualTypeOf<number>();
    expectTypeOf(result.current.first.value).toEqualTypeOf<number>();
    expect(result.current.a.value).toBe("x");
    expect(result.current.b.value).toBe(3);
  });

  it("rejects out-of-range indices and cross-position keys", () => {
    renderHook(() => {
      const form = useForm(schema, { initialValues });
      // @ts-expect-error "coord.5" is past the tuple's end — not offered
      useField(form, "coord.5");
      // @ts-expect-error "a" lives at position 0, not 1
      useField(form, "hetero.1.a");
      return null;
    });
  });

  it("a union below a tuple position binds its variant fields", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return { card: useVariantField(form, "wrap.0.pay", "cardNumber") };
    });
    expectTypeOf(result.current.card.value).toEqualTypeOf<
      string | undefined
    >();
  });
});

// Regression (2026-09 library review, types #4-#5): platform containers
// (File, Map, Set, ...) were descended as records, offering bogus
// sub-paths; a literal dotted key was offered by FieldPath but resolved to
// never (the runtime walk splits on ".", so the offer was the lie).
const leafSchema = z.object({
  meta: z.map(z.string(), z.number()),
  tags: z.set(z.string()),
  "a.b": z.string(),
  plain: z.object({ name: z.string() }),
});

describe("platform containers are leaves; dotted keys are not offered", () => {
  it("binds the container itself but offers no sub-paths", () => {
    renderHook(() => {
      const form = useForm(leafSchema, {
        initialValues: {
          meta: new Map<string, number>(),
          tags: new Set<string>(),
          "a.b": "",
          plain: { name: "" },
        },
      });
      const meta = useField(form, "meta");
      expectTypeOf(meta.value).toEqualTypeOf<Map<string, number>>();
      // @ts-expect-error Map is a leaf — no sub-paths
      useField(form, "meta.size");
      // @ts-expect-error Set is a leaf — no sub-paths
      useField(form, "tags.size");
      // @ts-expect-error a literal dotted key is not path-addressable
      useField(form, "a.b");
      const name = useField(form, "plain.name");
      expectTypeOf(name.value).toEqualTypeOf<string>();
      return null;
    });
  });
});
