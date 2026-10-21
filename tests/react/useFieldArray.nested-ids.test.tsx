import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

// Row ids of a NESTED array must follow their row when the OUTER array is
// reordered. The id entry is keyed by path ("teams.0.members"), so without
// re-seating, an outer swap leaves the entry for "teams.2.members" looking
// at team A's members with team C's history: every inner row remints and
// React remounts the inputs a user may be typing in.
const schema = z.object({
  teams: z.array(
    z.object({
      name: z.string(),
      members: z.array(z.object({ name: z.string() })),
    }),
  ),
});

const initial = {
  teams: [
    { name: "A", members: [{ name: "a1" }, { name: "a2" }] },
    { name: "B", members: [{ name: "b1" }] },
    { name: "C", members: [{ name: "c1" }, { name: "c2" }, { name: "c3" }] },
  ],
};

// Fixed inner hooks for three slots, in the order a real tree derives them:
// the outer hook (parent) first, then each row's inner hook.
const useTree = () => {
  const form = useForm(schema, { initialValues: initial });
  const teams = useFieldArray(form, "teams");
  const m0 = useFieldArray(form, "teams.0.members");
  const m1 = useFieldArray(form, "teams.1.members");
  const m2 = useFieldArray(form, "teams.2.members");
  return { form, teams, m0, m1, m2 };
};

type Tree = ReturnType<typeof useTree>;
const idsOf = (tree: Tree) => ({
  m0: tree.m0.fields.map((f) => f.id),
  m1: tree.m1.fields.map((f) => f.id),
  m2: tree.m2.fields.map((f) => f.id),
});

describe("nested useFieldArray: inner row ids follow outer reorders", () => {
  it("swap carries both rows' inner ids to their new slots", () => {
    const { result } = renderHook(useTree);
    const before = idsOf(result.current);
    expect(before.m0).toHaveLength(2);
    expect(before.m2).toHaveLength(3);

    act(() => result.current.teams.swap(0, 2));

    const after = idsOf(result.current);
    expect(result.current.m0.items.map((m) => m.name)).toEqual(["c1", "c2", "c3"]);
    expect(after.m0).toEqual(before.m2);
    expect(after.m1).toEqual(before.m1);
    expect(after.m2).toEqual(before.m0);
  });

  it("move rotates the inner ids with their rows", () => {
    const { result } = renderHook(useTree);
    const before = idsOf(result.current);

    act(() => result.current.teams.move(0, 2));

    const after = idsOf(result.current);
    expect(result.current.teams.items.map((t) => t.name)).toEqual(["B", "C", "A"]);
    expect(after.m0).toEqual(before.m1);
    expect(after.m1).toEqual(before.m2);
    expect(after.m2).toEqual(before.m0);
  });

  it("remove shifts the inner ids down and leaves nothing at the vacated slot", () => {
    const { result } = renderHook(useTree);
    const before = idsOf(result.current);

    act(() => result.current.teams.remove(0));

    const after = idsOf(result.current);
    expect(after.m0).toEqual(before.m1);
    expect(after.m1).toEqual(before.m2);
    expect(after.m2).toEqual([]);
  });

  it("insert shifts the inner ids up and mints only for the new row", () => {
    const { result } = renderHook(useTree);
    const before = idsOf(result.current);

    act(() =>
      result.current.teams.insert(0, {
        name: "N",
        members: [{ name: "n1" }],
      }),
    );

    const after = idsOf(result.current);
    expect(after.m0).toHaveLength(1);
    expect(after.m0).not.toEqual(before.m0);
    expect(after.m1).toEqual(before.m0);
    expect(after.m2).toEqual(before.m1);
  });

  it("a whole-array write that reorders the same row objects re-seats by value too", () => {
    const { result } = renderHook(useTree);
    const before = idsOf(result.current);
    const rows = result.current.teams.items;

    act(() =>
      result.current.form.setValue("teams", [rows[2]!, rows[0]!, rows[1]!]),
    );

    const after = idsOf(result.current);
    expect(after.m0).toEqual(before.m2);
    expect(after.m1).toEqual(before.m0);
    expect(after.m2).toEqual(before.m1);
  });

  it("an inner op after an outer swap keeps the surviving inner ids", () => {
    const { result } = renderHook(useTree);
    const before = idsOf(result.current);

    act(() => result.current.teams.swap(0, 2));
    act(() => result.current.m0.push({ name: "c4" }));

    const after = idsOf(result.current);
    expect(after.m0.slice(0, 3)).toEqual(before.m2);
    expect(after.m0).toHaveLength(4);
    expect(new Set(after.m0).size).toBe(4);
  });
});
