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
