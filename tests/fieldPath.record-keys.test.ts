// Number-keyed records (z.record(z.number(), ...) infers Record<number, V>)
// used to offer NO paths: the record arm enumerated `keyof T & string`,
// and keyof Record<number, V> is number. The keys are now offered as
// `${number}` segments, the spelling the runtime walk reads, and
// FieldValue resolves them to the value type.
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { FieldPath, FieldValue } from "../src/core/fieldPath";

const schema = z.object({
  byNum: z.record(z.number(), z.string()),
  byStr: z.record(z.string(), z.number()),
  deep: z.record(z.number(), z.object({ n: z.number(), tags: z.array(z.string()) })),
  optional: z.record(z.number(), z.boolean()).optional(),
});

type Values = z.input<typeof schema>;
type P = FieldPath<Values>;

describe("FieldPath over number-keyed records", () => {
  it("zod parses numeric-string keys for a number-keyed record", () => {
    // The runtime side of the offer: the keys the paths spell are the keys
    // the schema accepts.
    const parsed = schema.safeParse({
      byNum: { "5": "five" },
      byStr: { x: 1 },
      deep: { "7": { n: 1, tags: [] } },
    });
    expect(parsed.success).toBe(true);
  });

  it("offers `${number}` paths under a number-keyed record", () => {
    expectTypeOf<"byNum">().toMatchTypeOf<P>();
    expectTypeOf<`byNum.${number}`>().toMatchTypeOf<P>();
    expectTypeOf<"byNum.5">().toMatchTypeOf<P>();
    // The probe the review used: the subset under byNum is no longer never.
    expectTypeOf<[Extract<P, `byNum.${string}`>] extends [never] ? true : false>().toEqualTypeOf<false>();
  });

  it("keeps string-keyed records as before", () => {
    expectTypeOf<`byStr.${string}`>().toMatchTypeOf<P>();
    expectTypeOf<"byStr.anything">().toMatchTypeOf<P>();
  });

  it("descends through a number-keyed record's values", () => {
    expectTypeOf<`deep.${number}.n`>().toMatchTypeOf<P>();
    expectTypeOf<`deep.${number}.tags`>().toMatchTypeOf<P>();
    expectTypeOf<`deep.${number}.tags.${number}`>().toMatchTypeOf<P>();
    expectTypeOf<`optional.${number}`>().toMatchTypeOf<P>();
  });

  it("does not offer non-numeric keys under a number-keyed record", () => {
    expectTypeOf<"byNum.abc">().not.toMatchTypeOf<P>();
  });
});

describe("FieldValue through number-keyed records", () => {
  it("resolves a numeric-string segment to the value type", () => {
    expectTypeOf<FieldValue<Values, "byNum.5">>().toEqualTypeOf<string>();
    expectTypeOf<FieldValue<Values, `byNum.${number}`>>().toEqualTypeOf<string>();
    expectTypeOf<FieldValue<Values, `deep.${number}.n`>>().toEqualTypeOf<number>();
    expectTypeOf<FieldValue<Values, `deep.${number}.tags`>>().toEqualTypeOf<string[]>();
  });

  it("widens with undefined through an optional record", () => {
    expectTypeOf<FieldValue<Values, `optional.${number}`>>().toEqualTypeOf<boolean | undefined>();
  });

  it("string-keyed records are unchanged", () => {
    expectTypeOf<FieldValue<Values, "byStr.x">>().toEqualTypeOf<number>();
  });
});

describe("literal number keys", () => {
  type Literal = { 0: string; 1: number; named: boolean };
  it("spell as their own numeric strings", () => {
    type LP = FieldPath<Literal>;
    expectTypeOf<"0">().toMatchTypeOf<LP>();
    expectTypeOf<"1">().toMatchTypeOf<LP>();
    expectTypeOf<"named">().toMatchTypeOf<LP>();
    expectTypeOf<FieldValue<Literal, "0">>().toEqualTypeOf<string>();
    expectTypeOf<FieldValue<Literal, "1">>().toEqualTypeOf<number>();
  });
});
