import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  users: z.array(z.object({ email: z.string() })),
});

const useTestForm = () =>
  useForm(schema, {
    initialValues: { users: [{ email: "a@a.com" }, { email: "b@b.com" }] },
  });

const useTestArray = () => {
  const form = useTestForm();
  return { form, users: useFieldArray(form, "users") };
};

describe("useFieldArray stable IDs", () => {
  it("generates one id per initial item", () => {
    const { result } = renderHook(useTestArray);
    expect(result.current.users.fields).toHaveLength(2);
    expect(result.current.users.fields[0]?.id).toBeTypeOf("string");
    expect(result.current.users.fields[1]?.id).toBeTypeOf("string");
    expect(result.current.users.fields[0]?.id).not.toBe(
      result.current.users.fields[1]?.id,
    );
  });

  it("preserves ids across unrelated re-renders", () => {
    const { result, rerender } = renderHook(useTestArray);
    const before = result.current.users.fields.map((f) => f.id);
    rerender();
    const after = result.current.users.fields.map((f) => f.id);
    expect(after).toEqual(before);
  });

  it("push appends a new id, leaves existing ids untouched", () => {
    const { result } = renderHook(useTestArray);
    const beforeIds = result.current.users.fields.map((f) => f.id);

    act(() => {
      result.current.users.push({ email: "c@c.com" });
    });

    const afterIds = result.current.users.fields.map((f) => f.id);
    expect(afterIds.slice(0, 2)).toEqual(beforeIds);
    expect(afterIds[2]).not.toBe(beforeIds[0]);
    expect(afterIds[2]).not.toBe(beforeIds[1]);
  });

  it("remove drops the removed id, keeps the other", () => {
    const { result } = renderHook(useTestArray);
    const [idA, idB] = result.current.users.fields.map((f) => f.id);

    act(() => {
      result.current.users.remove(0);
    });

    expect(result.current.users.fields).toHaveLength(1);
    expect(result.current.users.fields[0]?.id).toBe(idB);
    expect(result.current.users.fields[0]?.id).not.toBe(idA);
  });

  it("move reorders ids in lock-step with items", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          users: [
            { email: "0@x.com" },
            { email: "1@x.com" },
            { email: "2@x.com" },
          ],
        },
      });
      return { form, users: useFieldArray(form, "users") };
    });
    const ids = result.current.users.fields.map((f) => f.id);

    act(() => {
      result.current.users.move(0, 2);
    });

    const afterIds = result.current.users.fields.map((f) => f.id);
    const afterEmails = result.current.users.items.map((u) => u.email);
    expect(afterEmails).toEqual(["1@x.com", "2@x.com", "0@x.com"]);
    expect(afterIds).toEqual([ids[1], ids[2], ids[0]]);
  });

  it("swap reorders ids alongside items", () => {
    const { result } = renderHook(useTestArray);
    const [idA, idB] = result.current.users.fields.map((f) => f.id);

    act(() => {
      result.current.users.swap(0, 1);
    });

    const afterIds = result.current.users.fields.map((f) => f.id);
    expect(afterIds).toEqual([idB, idA]);
  });

  it("insert places a new id at the chosen index", () => {
    const { result } = renderHook(useTestArray);
    const [idA, idB] = result.current.users.fields.map((f) => f.id);

    act(() => {
      result.current.users.insert(1, { email: "x@x.com" });
    });

    const afterIds = result.current.users.fields.map((f) => f.id);
    expect(afterIds[0]).toBe(idA);
    expect(afterIds[2]).toBe(idB);
    expect(afterIds[1]).not.toBe(idA);
    expect(afterIds[1]).not.toBe(idB);
  });

  it("recovers when an external push extends the array", () => {
    const { result } = renderHook(useTestArray);
    const beforeIds = result.current.users.fields.map((f) => f.id);

    act(() => {
      result.current.form.arrayPush("users", { email: "c@c.com" });
    });

    expect(result.current.users.fields).toHaveLength(3);
    const afterIds = result.current.users.fields.map((f) => f.id);
    expect(afterIds.slice(0, 2)).toEqual(beforeIds);
    expect(new Set(afterIds).size).toBe(3);
  });
});
