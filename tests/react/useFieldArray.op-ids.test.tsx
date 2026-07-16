import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  tags: z.array(z.string()),
});

const useTags = (initialTags: readonly string[]) => {
  const form = useForm(schema, {
    initialValues: { tags: [...initialTags] },
  });
  return { form, tags: useFieldArray(form, "tags") };
};

// Regression (2026-07 review #3): value-based id reconciliation cannot tell
// Object.is-equal rows apart, so remove(0) on ["", ""] used to hand the
// SURVIVOR the removed row's id — React kept the deleted row's subtree and
// unmounted the survivor's (focus and local state lost). Ops issued through
// the hook now commit their exact index mapping instead.
describe("useFieldArray ids for hook ops on duplicate values", () => {
  it("remove(0) on two equal rows keeps the survivor's id", () => {
    const { result } = renderHook(() => useTags(["", ""]));
    const [id0, id1] = result.current.tags.fields.map((f) => f.id);
    expect(id0).not.toBe(id1);

    act(() => {
      result.current.tags.remove(0);
    });

    expect(result.current.tags.items).toEqual([""]);
    expect(result.current.tags.fields[0]?.id).toBe(id1);
  });

  it("remove(1) on three equal rows removes exactly the middle id", () => {
    const { result } = renderHook(() => useTags(["x", "x", "x"]));
    const [id0, , id2] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      result.current.tags.remove(1);
    });

    expect(result.current.tags.fields.map((f) => f.id)).toEqual([id0, id2]);
  });

  it("insert among equal rows keeps the existing ids in place", () => {
    const { result } = renderHook(() => useTags(["x", "x"]));
    const [id0, id1] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      result.current.tags.insert(1, "x");
    });

    const ids = result.current.tags.fields.map((f) => f.id);
    expect(ids[0]).toBe(id0);
    expect(ids[2]).toBe(id1);
    expect(new Set(ids).size).toBe(3);
  });

  it("move and swap of equal rows carry ids to the destination", () => {
    const { result } = renderHook(() => useTags(["x", "x", "y"]));
    const [id0, id1, id2] = result.current.tags.fields.map((f) => f.id);

    act(() => {
      result.current.tags.move(0, 2);
    });
    expect(result.current.tags.items).toEqual(["x", "y", "x"]);
    expect(result.current.tags.fields.map((f) => f.id)).toEqual([
      id1,
      id2,
      id0,
    ]);

    act(() => {
      result.current.tags.swap(0, 2);
    });
    expect(result.current.tags.fields.map((f) => f.id)).toEqual([
      id0,
      id2,
      id1,
    ]);
  });

  it("push mints a fresh id and keeps the existing ones", () => {
    const { result } = renderHook(() => useTags(["", ""]));
    const before = result.current.tags.fields.map((f) => f.id);

    act(() => {
      result.current.tags.push("");
    });

    const after = result.current.tags.fields.map((f) => f.id);
    expect(after.slice(0, 2)).toEqual(before);
    expect(new Set(after).size).toBe(3);
  });

  it("an out-of-bounds remove is a no-op for ids too", () => {
    const { result } = renderHook(() => useTags(["a", "b"]));
    const before = result.current.tags.fields.map((f) => f.id);

    act(() => {
      result.current.tags.remove(5);
    });

    expect(result.current.tags.fields.map((f) => f.id)).toEqual(before);
  });

  it("an op followed by an external write in the same act stays consistent", () => {
    const { result } = renderHook(() => useTags(["a", "b"]));

    act(() => {
      result.current.tags.remove(0);
      // Bypasses the hook: the recorded op mapping no longer matches the
      // store, so id derivation falls back to value reconciliation.
      result.current.form.setValue("tags", ["b", "c"]);
    });

    expect(result.current.tags.items).toEqual(["b", "c"]);
    const ids = result.current.tags.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(2);
  });
});
