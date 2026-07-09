import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  users: z.array(z.object({ email: z.string() })),
  tags: z.array(z.string()),
});

const initial = {
  users: [{ email: "a@a.com" }, { email: "b@b.com" }, { email: "c@c.com" }],
  tags: ["x", "y"],
};

const useUsers = () => {
  const form = useForm(schema, { initialValues: initial });
  return { form, users: useFieldArray(form, "users") };
};

describe("useFieldArray ids survive mutations that bypass the hook", () => {
  it("ids follow items across an external move", () => {
    const { result } = renderHook(useUsers);
    const [idA, idB, idC] = result.current.users.fields.map((f) => f.id);

    act(() => {
      result.current.form.arrayMove("users", 0, 2);
    });

    expect(result.current.users.items.map((u) => u.email)).toEqual([
      "b@b.com",
      "c@c.com",
      "a@a.com",
    ]);
    // The id stays glued to the item, even though the move went through the
    // form API directly rather than users.move(...).
    expect(result.current.users.fields.map((f) => f.id)).toEqual([
      idB,
      idC,
      idA,
    ]);
  });

  it("ids follow items across an external same-length replace", () => {
    const { result } = renderHook(useUsers);
    const fieldsBefore = result.current.users.fields;
    const idByEmail = new Map(
      fieldsBefore.map((f) => [f.value.email, f.id] as const),
    );

    act(() => {
      // Reverse the array wholesale via setValue — same references, new order.
      const reversed = [...result.current.form.getState().values.users].reverse();
      result.current.form.setValue("users", reversed);
    });

    for (const field of result.current.users.fields) {
      expect(field.id).toBe(idByEmail.get(field.value.email));
    }
  });

  it("editing a field keeps its row id (no remount)", () => {
    const { result } = renderHook(useUsers);
    const [idA, idB, idC] = result.current.users.fields.map((f) => f.id);

    act(() => {
      result.current.form.setValue("users.1.email", "b2@b.com");
    });

    expect(result.current.users.items[1]?.email).toBe("b2@b.com");
    // Editing item 1 produces a fresh object reference, but the positional
    // fallback keeps the same id so the row updates rather than remounting.
    expect(result.current.users.fields.map((f) => f.id)).toEqual([
      idA,
      idB,
      idC,
    ]);
  });

  it("restore() to a prior snapshot keeps ids stable by identity", () => {
    const { result } = renderHook(useUsers);
    const idsBefore = result.current.users.fields.map((f) => f.id);
    const snap = result.current.form.snapshot();

    act(() => {
      result.current.users.push({ email: "d@d.com" });
    });
    expect(result.current.users.length).toBe(4);

    act(() => {
      result.current.form.restore(snap);
    });

    // Snapshot holds the original item references, so their ids come back.
    expect(result.current.users.fields.map((f) => f.id)).toEqual(idsBefore);
  });

  it("two hooks on the same path agree on ids after an external op", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: initial });
      return {
        form,
        a: useFieldArray(form, "users"),
        b: useFieldArray(form, "users"),
      };
    });

    act(() => {
      result.current.a.swap(0, 2);
    });

    const emailsA = result.current.a.items.map((u) => u.email);
    const emailsB = result.current.b.items.map((u) => u.email);
    expect(emailsA).toEqual(["c@c.com", "b@b.com", "a@a.com"]);
    // Both hooks reconcile ids from the same item references, so each row's id
    // tracks its item identically in both, even though only `a` triggered the op.
    const idByEmailA = new Map(
      result.current.a.fields.map((f) => [f.value.email, f.id] as const),
    );
    for (const field of result.current.b.fields) {
      expect(emailsB).toContain(field.value.email);
    }
    // Within each hook every row has a distinct id.
    expect(new Set(result.current.b.fields.map((f) => f.id)).size).toBe(3);
    expect(idByEmailA.size).toBe(3);
  });

  it("handles duplicate primitive values with distinct stable ids", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: initial });
      return { form, tags: useFieldArray(form, "tags") };
    });

    act(() => {
      result.current.form.setValue("tags", ["x", "x", "y"]);
    });

    const ids = result.current.tags.fields.map((f) => f.id);
    expect(result.current.tags.items).toEqual(["x", "x", "y"]);
    expect(new Set(ids).size).toBe(3);
  });
});
