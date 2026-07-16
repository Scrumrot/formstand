import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  tags: z.array(z.string()),
});

// Regression (2026-07 review, deferred finding): the exact-mapping id fix
// originally covered only ops issued through the SAME hook instance.
// Imperative ops (form.arrayRemove) and sibling hooks fell back to value
// reconciliation, which cannot tell Object.is-equal rows apart. The core's
// array-op log + the shared per-(store, path) id entry close both gaps.
describe("row ids for imperative array ops on duplicate values", () => {
  it("form.arrayRemove(0) on two equal rows keeps the survivor's id", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: ["", ""] } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const [id0, id1] = result.current.tags.fields.map((f) => f.id);
    expect(id0).not.toBe(id1);

    act(() => {
      result.current.form.arrayRemove("tags", 0);
    });

    expect(result.current.tags.items).toEqual([""]);
    expect(result.current.tags.fields[0]?.id).toBe(id1);
  });

  it("form.arrayMove on equal rows carries ids to their destinations", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { tags: ["x", "x", "y"] },
      });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const [id0, id1, id2] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      result.current.form.arrayMove("tags", 0, 2);
    });

    expect(result.current.tags.items).toEqual(["x", "y", "x"]);
    expect(result.current.tags.fields.map((f) => f.id)).toEqual([
      id1,
      id2,
      id0,
    ]);
  });

  it("two imperative ops before the next render both replay", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { tags: ["a", "a", "b"] },
      });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const [id0, id1, id2] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      // Both ops land in one React batch — the op log chains them.
      result.current.form.arrayRemove("tags", 0);
      result.current.form.arraySwap("tags", 0, 1);
    });

    expect(result.current.tags.items).toEqual(["b", "a"]);
    expect(result.current.tags.fields.map((f) => f.id)).toEqual([id2, id1]);
    expect(id0).not.toBe(id1);
  });
});

describe("op replay survives chain-adjacent writes", () => {
  // Regression (2026-07 review of f394ba4, #1): reconcileIds' equal-values
  // early return kept a STALE items anchor, so a fresh-but-equal setValue
  // (normalization pass, server refresh of unchanged data) silently broke
  // the op chain and the next remove of duplicate rows mis-keyed again.
  it("a fresh-but-equal whole-array write does not break the next op's replay", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: ["", ""] } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const [id0, id1] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      // Fresh array reference, Object.is-equal contents.
      result.current.form.setValue("tags", ["", ""]);
    });
    expect(result.current.tags.fields.map((f) => f.id)).toEqual([id0, id1]);

    act(() => {
      result.current.tags.remove(0);
    });
    expect(result.current.tags.fields[0]?.id).toBe(id1);
  });

  // Regression (2026-07 review of f394ba4, #2): the op record's `to` was
  // read from the store AFTER setState's synchronous subscriber
  // notification, so a subscriber issuing another same-path op made the
  // outer record span two writes — replaying to wrong ids on equal rows.
  it("a subscriber-issued op during notification chains instead of corrupting the log", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { tags: ["", "", ""] },
      });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const [id0, id1, id2] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      const form = result.current.form;
      const state = { fired: false };
      const unsubscribe = form.store.subscribe(() => {
        if (!state.fired) {
          state.fired = true;
          form.arraySwap("tags", 0, 1);
        }
      });
      form.arrayRemove("tags", 0);
      unsubscribe();
    });

    // remove(0) leaves [id1, id2]; the reentrant swap(0,1) → [id2, id1].
    expect(result.current.tags.items).toEqual(["", ""]);
    expect(result.current.tags.fields.map((f) => f.id)).toEqual([id2, id1]);
    expect(id0).not.toBe(id1);
  });
});

describe("partial op replay (chain broken mid-batch)", () => {
  // Regression (2026-07 review of f394ba4, B#1): a null-on-incomplete replay
  // threw away the op mappings it HAD walked, so an op followed by a non-op
  // write in the same batch value-reconciled from scratch and handed the
  // survivor the removed row's id. Replay now returns the furthest walked
  // state and only the remaining hop reconciles by value.
  it("remove(0) followed by a child setValue in one batch keeps the survivor's id", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: ["", ""] } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const [id0, id1] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      result.current.tags.remove(0);
      // Child-path write rebuilds the array with no op record.
      result.current.form.setValue("tags.0", "z");
    });

    expect(result.current.tags.items).toEqual(["z"]);
    expect(result.current.tags.fields[0]?.id).toBe(id1);
    expect(id0).not.toBe(id1);
  });

  // Regression (2026-07 review of f394ba4, B#3): the op log capped at 16
  // records by DROPPING the oldest, truncating the chain for longer
  // same-batch op runs. Consecutive records now COMPOSE instead, so an
  // arbitrarily long run stays fully replayable.
  it("a 17-op batch on duplicate rows still replays exactly", () => {
    const initialTags = Array.from({ length: 18 }, () => "");
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: initialTags } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const ids = result.current.tags.fields.map((f) => f.id);
    const lastId = ids[17];

    act(() => {
      Array.from({ length: 17 }).forEach(() => {
        result.current.tags.remove(0);
      });
    });

    expect(result.current.tags.items).toEqual([""]);
    expect(result.current.tags.fields[0]?.id).toBe(lastId);
  });
});

describe("chain-breaking writes and the op log", () => {
  // Regression (2026-07 convergence review, A#1): reset() restores the
  // exact initialValues REFERENCE, so a recurring array reference could
  // falsely chain against a stale record from before the reset. The core
  // now clears a path's records on chain-breaking writes.
  it("ops around a reset() do not mis-key duplicate-free or duplicate rows", () => {
    const initialTags = ["a", "b"];
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: initialTags } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const [id0] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      result.current.form.arrayRemove("tags", 0); // ["b"]
      result.current.form.reset(); // back to the SAME ["a","b"] reference
      result.current.form.arrayRemove("tags", 1); // ["a"]
    });

    expect(result.current.tags.items).toEqual(["a"]);
    // The surviving row is original row 0 and must keep row 0's id — the
    // stale pre-reset record must not resurrect row b's id.
    expect(result.current.tags.fields[0]?.id).toBe(id0);
  });

  // Regression (2026-07 convergence review, altitude #1): a chain break
  // BEFORE an op (the mirror of the op-then-setValue case) used to lose the
  // op's exactness entirely. The walk now bridges the gap by value and
  // applies the op exactly.
  it("setValue followed by an op in one batch still replays the op exactly", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: ["", ""] } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const [id0, id1] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      // Fresh-but-equal whole-array write, then the op — one batch.
      result.current.form.setValue("tags", ["", ""]);
      result.current.form.arrayRemove("tags", 0);
    });

    expect(result.current.tags.items).toEqual([""]);
    expect(result.current.tags.fields[0]?.id).toBe(id1);
    expect(id0).not.toBe(id1);
  });

  // Regression (2026-07 convergence review, A#3): ring composition must not
  // consume the record the consumer is anchored at. Records are cleared
  // once walked, so a prior op + render followed by a 16-op batch replays
  // fully.
  it("a rendered op followed by a 16-op batch stays exactly replayable", () => {
    const initialTags = Array.from({ length: 18 }, () => "");
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: initialTags } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const idsAtStart = result.current.tags.fields.map((f) => f.id);
    const lastId = idsAtStart[17];

    act(() => {
      result.current.tags.remove(0); // walked + cleared on this render
    });
    expect(result.current.tags.fields[0]?.id).toBe(idsAtStart[1]);

    act(() => {
      Array.from({ length: 16 }).forEach(() => {
        result.current.tags.remove(0);
      });
    });

    expect(result.current.tags.items).toEqual([""]);
    expect(result.current.tags.fields[0]?.id).toBe(lastId);
  });
});

describe("sibling useFieldArray hooks on the same path", () => {
  it("agree on ids after a hook-issued remove of equal rows", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: ["", ""] } });
      return {
        form,
        a: useFieldArray(form, "tags"),
        b: useFieldArray(form, "tags"),
      };
    });
    const aIds = result.current.a.fields.map((f) => f.id);
    expect(result.current.b.fields.map((f) => f.id)).toEqual(aIds);

    act(() => {
      result.current.a.remove(0);
    });

    // Both hooks keep the SURVIVOR's id — including the non-issuing one.
    expect(result.current.a.fields[0]?.id).toBe(aIds[1]);
    expect(result.current.b.fields[0]?.id).toBe(aIds[1]);
  });

  it("agree after an imperative swap of equal rows", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: ["x", "x"] } });
      return {
        form,
        a: useFieldArray(form, "tags"),
        b: useFieldArray(form, "tags"),
      };
    });
    const [id0, id1] = result.current.a.fields.map((f) => f.id);

    act(() => {
      result.current.form.arraySwap("tags", 0, 1);
    });

    expect(result.current.a.fields.map((f) => f.id)).toEqual([id1, id0]);
    expect(result.current.b.fields.map((f) => f.id)).toEqual([id1, id0]);
  });
});
