import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { flattenIssues, isPathOrChild } from "../src/core/validation";

// Seeded brute-force consistency testing: after arbitrary write/op
// sequences, the form's error state must agree EXACTLY with a full
// schema.safeParse — both after validate() (full pass) and after
// validateField() on any path (the subschema fast path, the full-parse
// filtered path, and the skip path must all be indistinguishable from a
// full parse within their scope). This is the property the field-scoped
// reviews kept relitigating, made executable.

const schema = z
  .object({
    name: z.string().min(2),
    age: z.int().min(0).max(120).nullable(),
    tags: z.array(z.string().min(1)).max(4),
    profile: z
      .object({
        bio: z.string().optional(),
        score: z.number().min(0),
      })
      // A mid-level refinement forces the extraction bail (full-parse
      // filtered scope) for every path under profile.
      .refine((p) => p.bio === undefined || p.bio !== String(p.score), {
        message: "bio must not equal score",
        path: ["bio"],
      }),
  })
  // A root refinement keyed at a field, so even top-level paths mix
  // subschema and root-sourced errors.
  .refine((v) => v.name !== "taboo", { message: "taboo", path: ["name"] });

type Values = z.input<typeof schema>;

const initialValues: Values = {
  name: "ok",
  age: 30,
  tags: ["a"],
  profile: { score: 1 },
};

const mulberry32 = (seed: number): (() => number) => {
  const state = { s: seed >>> 0 };
  return () => {
    state.s = (state.s + 0x6d2b79f5) >>> 0;
    const t0 = Math.imul(state.s ^ (state.s >>> 15), state.s | 1);
    const t1 = t0 ^ (t0 + Math.imul(t0 ^ (t0 >>> 7), t0 | 61));
    return ((t1 ^ (t1 >>> 14)) >>> 0) / 4294967296;
  };
};

// Value pools per path — mixing valid, boundary, and invalid entries.
const STRING_POOL = ["ok", "", "x", "taboo", "long enough", "  "] as const;
const AGE_POOL = [0, 120, -1, 121, 30, 3.5, null] as const;
const SCORE_POOL = [0, -1, 5, 2.5] as const;
const TAG_POOL = ["a", "", "b", "1"] as const;

const WRITE_PATHS = [
  "name",
  "age",
  "profile.bio",
  "profile.score",
  "tags.0",
  "tags.1",
] as const;

const VALIDATE_PATHS = [
  "name",
  "age",
  "tags",
  "tags.0",
  "tags.2",
  "tags.9", // out-of-range: the skip scope
  "profile",
  "profile.bio",
  "profile.score",
] as const;

const groundTruthErrors = (values: unknown): Readonly<Record<string, readonly string[]>> => {
  const parsed = schema.safeParse(values);
  return parsed.success ? {} : flattenIssues(parsed.error.issues);
};

const runFuzz = (seed: number, batches: number): void => {
  const rand = mulberry32(seed);
  const int = (max: number): number => Math.floor(rand() * max);
  const pick = <T,>(pool: readonly T[]): T => pool[int(pool.length)] as T;
  const form = createForm(schema, { initialValues });

  Array.from({ length: batches }).forEach((_, batchIndex) => {
    const label = `seed ${seed} batch ${batchIndex}`;

    // 1-4 random writes/ops.
    Array.from({ length: 1 + int(4) }).forEach(() => {
      const move = rand();
      if (move < 0.55) {
        const path = pick(WRITE_PATHS);
        const value =
          path === "age"
            ? pick(AGE_POOL)
            : path === "profile.score"
              ? pick(SCORE_POOL)
              : path.startsWith("tags.")
                ? pick(TAG_POOL)
                : pick(STRING_POOL);
        form.setValue(path as never, value as never);
      } else if (move < 0.7) {
        form.arrayPush("tags" as never, pick(TAG_POOL) as never);
      } else if (move < 0.85) {
        const len = (form.getState().values.tags ?? []).length;
        if (len > 0) form.arrayRemove("tags" as never, int(len));
      } else if (move < 0.95) {
        const len = (form.getState().values.tags ?? []).length;
        if (len > 1) form.arraySwap("tags" as never, int(len), int(len));
      } else {
        form.reset();
      }
    });

    // Full pass must equal ground truth exactly.
    const truth = groundTruthErrors(form.getState().values);
    const result = form.validate();
    expect(result.kind, label).toBe(
      Object.keys(truth).length === 0 ? "valid" : "invalid",
    );
    expect(form.getState().errors, `${label} full pass`).toEqual(truth);

    // A field-scoped pass on ANY path must be indistinguishable from the
    // full pass: in-scope entries re-derived to the same values, the rest
    // untouched — so the whole map still equals ground truth.
    const fieldPath = pick(VALIDATE_PATHS);
    form.validateField(fieldPath as never);
    expect(
      form.getState().errors,
      `${label} after validateField("${fieldPath}")`,
    ).toEqual(truth);

    // And the scoped RESULT agrees with the map's slice.
    const scopedTruth = Object.entries(truth)
      .filter(([key]) => isPathOrChild(key, fieldPath))
      .flatMap(([, messages]) => messages);
    const fieldResult = form.validateField(fieldPath as never);
    expect(fieldResult.kind, `${label} result("${fieldPath}")`).toBe(
      scopedTruth.length === 0 ? "valid" : "invalid",
    );
  });
};

describe("validation consistency fuzz (safeParse as oracle)", () => {
  beforeEach(() => {
    // validateField on out-of-schema/out-of-range paths warns by design.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("full and field-scoped validation always match a full parse", () => {
    [7, 19, 31, 53, 97, 131].forEach((seed) => runFuzz(seed, 120));
  });
});
