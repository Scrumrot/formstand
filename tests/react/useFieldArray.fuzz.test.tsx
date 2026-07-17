import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

// Seeded brute-force scenario testing for the array-op id machinery — the
// zone every review round found bugs in. Every row holds the SAME primitive
// value ("x"), so value matching carries zero information: only exact op
// tracking can keep ids glued to the right rows. A token model simulates
// the ops as the oracle; two sibling hooks must always agree; ops are
// issued through the hook and imperatively in random mixes and batch sizes.
// Deterministic: fixed seeds, reproducible failures (the assertion message
// carries seed + batch index).

const schema = z.object({ tags: z.array(z.string()) });

// mulberry32 — tiny deterministic PRNG.
const mulberry32 = (seed: number): (() => number) => {
  const state = { s: seed >>> 0 };
  return () => {
    state.s = (state.s + 0x6d2b79f5) >>> 0;
    const t0 = Math.imul(state.s ^ (state.s >>> 15), state.s | 1);
    const t1 = t0 ^ (t0 + Math.imul(t0 ^ (t0 >>> 7), t0 | 61));
    return ((t1 ^ (t1 >>> 14)) >>> 0) / 4294967296;
  };
};

type OpKind = "push" | "remove" | "insert" | "move" | "swap";
type BreakerKind = "setValueCopy" | "reset" | "childWrite";

type Harness = Readonly<{
  form: ReturnType<typeof useForm<typeof schema>>;
  a: ReturnType<typeof useFieldArray<typeof schema, "tags">>;
  b: ReturnType<typeof useFieldArray<typeof schema, "tags">>;
}>;

const mountHarness = () =>
  renderHook((): Harness => {
    const form = useForm(schema, {
      initialValues: { tags: ["x", "x", "x"] },
    });
    return {
      form,
      a: useFieldArray(form, "tags"),
      b: useFieldArray(form, "tags"),
    };
  });

// The oracle: rows as unique tokens, transformed exactly like the ops.
const applyModelOp = (
  model: readonly number[],
  kind: OpKind,
  i: number,
  j: number,
  freshToken: number,
): readonly number[] => {
  switch (kind) {
    case "push":
      return [...model, freshToken];
    case "remove":
      return [...model.slice(0, i), ...model.slice(i + 1)];
    case "insert":
      return [...model.slice(0, i), freshToken, ...model.slice(i)];
    case "move": {
      const without = [...model.slice(0, i), ...model.slice(i + 1)];
      const moved = model[i] as number;
      return [...without.slice(0, j), moved, ...without.slice(j)];
    }
    case "swap":
      return model.map((t, k) => (k === i ? (model[j] as number) : k === j ? (model[i] as number) : t));
  }
};

type FuzzState = {
  model: readonly number[];
  nextToken: number;
  // token -> the id the UI bound to that row. Cleared (rebound) after a
  // chain-breaking write, where exact tracking is documented best-effort.
  bindings: Map<number, string>;
};

const assertInvariants = (
  harness: Harness,
  state: FuzzState,
  strict: boolean,
  label: string,
): void => {
  const aIds = harness.a.fields.map((f) => f.id);
  const bIds = harness.b.fields.map((f) => f.id);
  expect(aIds, `${label}: sibling hooks disagree`).toEqual(bIds);
  expect(aIds.length, `${label}: length drift`).toBe(state.model.length);
  expect(new Set(aIds).size, `${label}: duplicate ids`).toBe(aIds.length);

  if (strict) {
    // Every surviving token keeps its bound id; fresh tokens must not
    // steal any previously-bound id.
    const known = new Set(state.bindings.values());
    state.model.forEach((token, position) => {
      const bound = state.bindings.get(token);
      const rendered = aIds[position] as string;
      if (bound !== undefined) {
        expect(
          rendered,
          `${label}: row ${position} (token ${token}) lost its id`,
        ).toBe(bound);
      } else {
        expect(
          known.has(rendered),
          `${label}: fresh row ${position} stole a live id ${rendered}`,
        ).toBe(false);
        state.bindings.set(token, rendered);
      }
    });
  } else {
    // Weak mode (after a chain-breaker): rebind whatever the UI settled on.
    state.bindings.clear();
    state.model.forEach((token, position) => {
      state.bindings.set(token, aIds[position] as string);
    });
  }
  // Drop bindings for dead tokens so the "stolen id" check tracks only
  // live rows (an id may be legitimately re-minted never — prefixes are
  // per path — but dead bindings would bloat the map).
  const live = new Set(state.model);
  [...state.bindings.keys()]
    .filter((token) => !live.has(token))
    .forEach((token) => state.bindings.delete(token));
};

const runFuzz = (
  seed: number,
  batches: number,
  withBreakers: boolean,
): void => {
  const rand = mulberry32(seed);
  const int = (max: number): number => Math.floor(rand() * max);
  const { result } = mountHarness();

  const state: FuzzState = {
    model: [0, 1, 2],
    nextToken: 3,
    bindings: new Map(),
  };
  // Bind the initial rows.
  assertInvariants(result.current, state, false, `seed ${seed} init`);

  Array.from({ length: batches }).forEach((_, batchIndex) => {
    const opsInBatch = 1 + int(3);
    const batch = { brokeChain: false };

    act(() => {
      Array.from({ length: opsInBatch }).forEach(() => {
        const form = result.current.form;
        const useBreaker = withBreakers && rand() < 0.15;
        if (useBreaker) {
          const breaker: BreakerKind = (
            ["setValueCopy", "reset", "childWrite"] as const
          )[int(3)] as BreakerKind;
          batch.brokeChain = true;
          if (breaker === "reset") {
            form.reset();
            state.model = [
              state.nextToken,
              state.nextToken + 1,
              state.nextToken + 2,
            ];
            state.nextToken += 3;
          } else if (breaker === "setValueCopy") {
            // Fresh reference, identical values — the re-anchor case.
            form.setValue("tags", [...form.getState().values.tags]);
          } else if (state.model.length > 0) {
            // Same-value child write: rebuilds the array spine.
            form.setValue(`tags.${int(state.model.length)}`, "x");
          }
          return;
        }

        const len = state.model.length;
        const forcedPush = len === 0;
        const forcedRemove = len >= 12;
        const kind: OpKind = forcedPush
          ? "push"
          : forcedRemove
            ? "remove"
            : (["push", "remove", "insert", "move", "swap"] as const)[
                int(5)
              ] as OpKind;
        const i = kind === "insert" ? int(len + 1) : int(Math.max(len, 1));
        const j = int(Math.max(len, 1));
        const viaHook = rand() < 0.5;
        const issue = viaHook ? result.current.a : null;

        if (kind === "push") {
          if (issue !== null) issue.push("x");
          else form.arrayPush("tags", "x");
        } else if (kind === "remove") {
          if (issue !== null) issue.remove(i);
          else form.arrayRemove("tags", i);
        } else if (kind === "insert") {
          if (issue !== null) issue.insert(i, "x");
          else form.arrayInsert("tags", i, "x");
        } else if (kind === "move") {
          if (issue !== null) issue.move(i, j);
          else form.arrayMove("tags", i, j);
        } else {
          if (issue !== null) issue.swap(i, j);
          else form.arraySwap("tags", i, j);
        }
        state.model = applyModelOp(
          state.model,
          kind,
          i,
          j,
          state.nextToken,
        );
        if (kind === "push" || kind === "insert") state.nextToken += 1;
      });
    });

    assertInvariants(
      result.current,
      state,
      !batch.brokeChain,
      `seed ${seed} batch ${batchIndex}`,
    );
  });
};

describe("useFieldArray id fuzz (all rows Object.is-equal)", () => {
  it("pure op sequences: ids follow the token model exactly", () => {
    [11, 23, 42, 77, 101, 137].forEach((seed) => runFuzz(seed, 150, false));
  });

  it("op sequences with chain-breaking writes: uniqueness, sibling agreement, and post-break exactness hold", () => {
    [13, 29, 47, 83, 107, 139].forEach((seed) => runFuzz(seed, 150, true));
  });
});
