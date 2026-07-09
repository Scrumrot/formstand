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

describe("useFieldArray", () => {
  it("exposes items and length for the path", () => {
    const { result } = renderHook(() => {
      const form = useTestForm();
      return { form, users: useFieldArray(form, "users") };
    });
    expect(result.current.users.items).toHaveLength(2);
    expect(result.current.users.length).toBe(2);
  });

  it("push appends a new item", () => {
    const { result } = renderHook(() => {
      const form = useTestForm();
      return { form, users: useFieldArray(form, "users") };
    });
    act(() => {
      result.current.users.push({ email: "c@c.com" });
    });
    expect(result.current.users.length).toBe(3);
    expect(result.current.users.items[2]?.email).toBe("c@c.com");
  });

  it("remove deletes by index", () => {
    const { result } = renderHook(() => {
      const form = useTestForm();
      return { form, users: useFieldArray(form, "users") };
    });
    act(() => {
      result.current.users.remove(0);
    });
    expect(result.current.users.items.map((u) => u.email)).toEqual(["b@b.com"]);
  });

  it("insert / move / swap work", () => {
    const { result } = renderHook(() => {
      const form = useTestForm();
      return { form, users: useFieldArray(form, "users") };
    });

    act(() => {
      result.current.users.insert(1, { email: "x@x.com" });
    });
    expect(result.current.users.items.map((u) => u.email)).toEqual([
      "a@a.com",
      "x@x.com",
      "b@b.com",
    ]);

    act(() => {
      result.current.users.swap(0, 2);
    });
    expect(result.current.users.items.map((u) => u.email)).toEqual([
      "b@b.com",
      "x@x.com",
      "a@a.com",
    ]);

    act(() => {
      result.current.users.move(2, 0);
    });
    expect(result.current.users.items.map((u) => u.email)).toEqual([
      "a@a.com",
      "b@b.com",
      "x@x.com",
    ]);
  });
});
