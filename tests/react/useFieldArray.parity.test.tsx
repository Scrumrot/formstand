// useFieldArray's useField parity: the array path's own flags (touched,
// dirty, isValidating), setTouched/onBlur/validate, and the whole-array
// writes (replace/update/prepend/clear). The flags are read at the ARRAY
// path, so a row's own blur does not touch the array, and dirty compares
// the whole array against its initial value.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import type { FieldValidationResult } from "../../src/core/validation";
import { useField } from "../../src/react/useField";
import {
  type FieldArrayFormApi,
  useFieldArray,
} from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  users: z
    .array(z.object({ name: z.string().min(1, "required") }))
    .min(1, "at least one")
    .max(2, "too many"),
});

type Values = z.input<typeof schema>;

const two: Values = { users: [{ name: "a" }, { name: "b" }] };

const useHarness = (
  initialValues: Values,
  mode: "onBlur" | "onChange" | "onSubmit" = "onBlur",
) =>
  renderHook(() => {
    const form = useForm(schema, { initialValues, mode });
    return {
      form,
      users: useFieldArray(form, "users"),
      first: useField(form, "users.0.name"),
    };
  });

describe("useFieldArray flags at the array path", () => {
  it("starts untouched, clean, and idle", () => {
    const { result } = useHarness(two);
    expect(result.current.users.touched).toBe(false);
    expect(result.current.users.dirty).toBe(false);
    expect(result.current.users.isValidating).toBe(false);
    expectTypeOf(result.current.users.touched).toEqualTypeOf<boolean>();
  });

  it("touched is the array path's flag, not a row's", () => {
    const { result } = useHarness(two);
    act(() => result.current.first.onBlur());
    expect(result.current.first.touched).toBe(true);
    expect(result.current.users.touched).toBe(false);
    act(() => result.current.users.setTouched());
    expect(result.current.users.touched).toBe(true);
    expect(result.current.form.getState().touched["users"]).toBe(true);
    act(() => result.current.users.setTouched(false));
    expect(result.current.users.touched).toBe(false);
  });

  it("dirty compares the whole array against its initial value", () => {
    const { result } = useHarness(two);
    act(() => result.current.users.push({ name: "c" }));
    expect(result.current.users.dirty).toBe(true);
    act(() => result.current.users.remove(2));
    expect(result.current.users.dirty).toBe(false);
    act(() => result.current.users.update(0, { name: "z" }));
    expect(result.current.users.dirty).toBe(true);
    act(() => result.current.users.update(0, { name: "a" }));
    expect(result.current.users.dirty).toBe(false);
  });
});

describe("useFieldArray onBlur and validate", () => {
  it("onBlur marks the array touched and validates under the blur gate", () => {
    const { result } = useHarness({ users: [] }, "onBlur");
    expect(result.current.users.error).toBeUndefined();
    act(() => result.current.users.onBlur());
    expect(result.current.users.touched).toBe(true);
    expect(result.current.users.firstError).toBe("at least one");
  });

  it("onBlur stays silent in onSubmit mode before the first submit", () => {
    const { result } = useHarness({ users: [] }, "onSubmit");
    act(() => result.current.users.onBlur());
    expect(result.current.users.touched).toBe(true);
    expect(result.current.users.error).toBeUndefined();
  });

  it("validate runs array-scoped validation and returns the result", () => {
    const { result } = useHarness({ users: [{ name: "a" }, { name: "b" }, { name: "c" }] });
    const outcomes: FieldValidationResult[] = [];
    act(() => {
      outcomes.push(result.current.users.validate());
    });
    expect(outcomes[0]).toEqual({ kind: "invalid", errors: ["too many"] });
    expect(result.current.users.firstError).toBe("too many");
    expectTypeOf(result.current.users.validate).returns.toEqualTypeOf<FieldValidationResult>();
    act(() => result.current.users.remove(2));
    act(() => {
      outcomes.push(result.current.users.validate());
    });
    expect(outcomes[1]).toEqual({ kind: "valid" });
  });
});

describe("useFieldArray whole-array writes", () => {
  it("replace writes the array and ids follow surviving row references", () => {
    const { result } = useHarness(two);
    const [idA, idB] = result.current.users.fields.map((f) => f.id);
    const [rowA, rowB] = result.current.users.items;
    // The same row objects in a new order plus a new row: reconciliation
    // matches by identity, so A and B keep their ids and C mints.
    act(() => result.current.users.replace([rowB!, rowA!, { name: "c" }]));
    expect(result.current.users.items.map((u) => u.name)).toEqual(["b", "a", "c"]);
    const ids = result.current.users.fields.map((f) => f.id);
    expect(ids[0]).toBe(idB);
    expect(ids[1]).toBe(idA);
    expect(ids[2]).not.toBe(idA);
    expect(ids[2]).not.toBe(idB);
  });

  it("replace with fresh literals keeps ids by index", () => {
    const { result } = useHarness(two);
    const before = result.current.users.fields.map((f) => f.id);
    act(() => result.current.users.replace([{ name: "a2" }, { name: "b2" }]));
    expect(result.current.users.fields.map((f) => f.id)).toEqual(before);
  });

  it("update writes one row in place and the row keeps its id", () => {
    const { result } = useHarness(two);
    const before = result.current.users.fields.map((f) => f.id);
    act(() => result.current.users.update(1, { name: "B" }));
    expect(result.current.users.items).toEqual([{ name: "a" }, { name: "B" }]);
    expect(result.current.users.fields.map((f) => f.id)).toEqual(before);
    expect(result.current.form.getState().values.users[1]?.name).toBe("B");
  });

  it("prepend inserts at index 0 and existing rows keep their ids", () => {
    const { result } = useHarness(two);
    const before = result.current.users.fields.map((f) => f.id);
    act(() => result.current.users.prepend({ name: "z" }));
    expect(result.current.users.items.map((u) => u.name)).toEqual(["z", "a", "b"]);
    const after = result.current.users.fields.map((f) => f.id);
    expect(after.slice(1)).toEqual(before);
    expect(before).not.toContain(after[0]);
  });

  it("clear empties the array", () => {
    const { result } = useHarness(two);
    act(() => result.current.users.clear());
    expect(result.current.users.items).toEqual([]);
    expect(result.current.users.length).toBe(0);
    expect(result.current.users.dirty).toBe(true);
  });

  it("the writes revalidate under the change gate like the index ops", () => {
    const { result } = useHarness(two, "onChange");
    act(() => result.current.users.replace([{ name: "a" }, { name: "b" }, { name: "c" }]));
    expect(result.current.users.firstError).toBe("too many");
    act(() => result.current.users.clear());
    expect(result.current.users.firstError).toBe("at least one");
    act(() => result.current.users.prepend({ name: "a" }));
    expect(result.current.users.error).toBeUndefined();
  });
});

describe("hand-rolled FieldArrayFormApi without the optional members", () => {
  it("the parity functions no-op instead of throwing", () => {
    const core = createForm(schema, { initialValues: two });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Only the required surface: the store and the five index ops.
    const bare: FieldArrayFormApi = {
      store: core.store,
      arrayPush: (path, item) => core.arrayPush(path as "users", item as Values["users"][number]),
      arrayRemove: (path, index) => core.arrayRemove(path as "users", index),
      arrayInsert: (path, index, item) =>
        core.arrayInsert(path as "users", index, item as Values["users"][number]),
      arrayMove: (path, from, to) => core.arrayMove(path as "users", from, to),
      arraySwap: (path, a, b) => core.arraySwap(path as "users", a, b),
    };
    const { result } = renderHook(() =>
      useFieldArray<Values["users"][number]>(bare, "users"),
    );
    act(() => {
      result.current.setTouched();
      result.current.onBlur();
      result.current.replace([]);
      result.current.update(0, { name: "x" });
      result.current.clear();
    });
    expect(result.current.touched).toBe(false);
    expect(result.current.items).toEqual(two.users);
    expect(result.current.validate()).toEqual({ kind: "valid" });
    act(() => result.current.prepend({ name: "p" }));
    expect(result.current.items.map((u) => u.name)).toEqual(["p", "a", "b"]);
    warn.mockRestore();
  });
});
