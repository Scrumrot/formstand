import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

afterEach(cleanup);

const schema = z.object({ items: z.array(z.string()) });

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>{children}</StrictMode>
);

describe("useFieldArray under StrictMode", () => {
  it("keeps ids glued to items across reorders despite double-rendering", () => {
    const { result } = renderHook(
      () => {
        const form = useForm(schema, {
          initialValues: { items: ["a", "b", "c"] },
        });
        return { form, arr: useFieldArray<string>(form, "items") };
      },
      { wrapper },
    );

    const before = result.current.arr.fields;
    expect(before.map((f) => f.value)).toEqual(["a", "b", "c"]);
    const idOf = Object.fromEntries(before.map((f) => [f.value, f.id]));

    act(() => {
      result.current.arr.move(0, 2);
    });

    const after = result.current.arr.fields;
    expect(after.map((f) => f.value)).toEqual(["b", "c", "a"]);
    expect(after.map((f) => f.id)).toEqual([
      idOf["b"],
      idOf["c"],
      idOf["a"],
    ]);
  });

  it("mints unique ids for pushed items", () => {
    const { result } = renderHook(
      () => {
        const form = useForm(schema, { initialValues: { items: ["a"] } });
        return { form, arr: useFieldArray<string>(form, "items") };
      },
      { wrapper },
    );

    act(() => {
      result.current.arr.push("b");
    });
    act(() => {
      result.current.arr.push("c");
    });

    const ids = result.current.arr.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(3);
  });
});
