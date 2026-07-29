import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createStore } from "zustand/vanilla";
import type { FormState } from "../../src/core/types";
import {
  type FieldArrayFormApi,
  useFieldArray,
} from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  users: z.array(z.object({ email: z.string() })).min(1, "need at least one"),
});

const boundedSchema = z.object({
  users: z
    .array(z.object({ email: z.string() }))
    .min(2, "need at least two")
    .max(2, "at most two"),
});

type UsersValues = z.input<typeof boundedSchema>;

const rows = (count: number): UsersValues["users"] =>
  Array.from({ length: count }, (_, i) => ({ email: `u${i}@a.com` }));

describe("useFieldArray.error", () => {
  it("surfaces array-level errors at the array path", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { users: [] } });
      return { form, users: useFieldArray(form, "users") };
    });

    expect(result.current.users.error).toBeUndefined();
    act(() => {
      result.current.form.validate();
    });
    expect(result.current.users.error).toEqual(["need at least one"]);
  });

  it("clears the array-level error once the array is populated and re-validated", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { users: [] } });
      return { form, users: useFieldArray(form, "users") };
    });

    act(() => {
      result.current.form.validate();
    });
    expect(result.current.users.error).toBeDefined();

    act(() => {
      result.current.users.push({ email: "a@a.com" });
      result.current.form.validate();
    });
    expect(result.current.users.error).toBeUndefined();
  });
});

// The op wrappers revalidate the ARRAY path after each op, under the exact
// change-trigger gate useField.setValue applies (shouldValidateOn) — so a
// visible array-level error tracks push/remove instead of going stale.
describe("useFieldArray op revalidation", () => {
  it("a stale array error clears on push when the revalidate gate is open", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { users: [] },
        mode: "onChange",
      });
      return { form, users: useFieldArray(form, "users") };
    });

    act(() => {
      result.current.form.validate();
    });
    expect(result.current.users.error).toEqual(["need at least one"]);

    // No explicit validate: the push itself must clear the stale error.
    act(() => {
      result.current.users.push({ email: "a@a.com" });
    });
    expect(result.current.users.error).toBeUndefined();
  });

  it("remove below .min raises the array error without an explicit validate", () => {
    const { result } = renderHook(() => {
      const form = useForm(boundedSchema, {
        initialValues: { users: rows(2) },
        mode: "onChange",
      });
      return { form, users: useFieldArray(form, "users") };
    });

    expect(result.current.users.error).toBeUndefined();
    act(() => {
      result.current.users.remove(0);
    });
    expect(result.current.users.error).toEqual(["need at least two"]);
  });

  it("push past .max raises the array error without an explicit validate", () => {
    const { result } = renderHook(() => {
      const form = useForm(boundedSchema, {
        initialValues: { users: rows(2) },
        mode: "onChange",
      });
      return { form, users: useFieldArray(form, "users") };
    });

    expect(result.current.users.error).toBeUndefined();
    act(() => {
      result.current.users.push({ email: "extra@a.com" });
    });
    expect(result.current.users.error).toEqual(["at most two"]);
  });

  it("the closed gate does not validate (onSubmit mode, no submit yet)", () => {
    const { result } = renderHook(() => {
      // Default mode is onSubmit: before any submit, change-triggered
      // validation must not run — the ops stay silent like setValue does.
      const form = useForm(boundedSchema, {
        initialValues: { users: rows(2) },
      });
      return { form, users: useFieldArray(form, "users") };
    });

    act(() => {
      result.current.users.push({ email: "extra@a.com" });
      result.current.users.remove(0);
      result.current.users.remove(0);
    });
    expect(result.current.users.error).toBeUndefined();
  });

  it("the closed gate does not validate (onTouched mode, array path untouched)", () => {
    const { result } = renderHook(() => {
      const form = useForm(boundedSchema, {
        initialValues: { users: rows(2) },
        mode: "onTouched",
      });
      return { form, users: useFieldArray(form, "users") };
    });

    act(() => {
      result.current.users.remove(0);
    });
    expect(result.current.users.error).toBeUndefined();
  });

  it("a stale error survives ops in onBlur mode (blur-only gate stays closed on change)", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { users: [] },
        mode: "onBlur",
        reValidateMode: "onBlur",
      });
      return { form, users: useFieldArray(form, "users") };
    });

    act(() => {
      result.current.form.validate();
    });
    expect(result.current.users.error).toEqual(["need at least one"]);

    act(() => {
      result.current.users.push({ email: "a@a.com" });
    });
    // Deliberately stale: the change trigger never opens a blur-only gate.
    expect(result.current.users.error).toEqual(["need at least one"]);
  });

  it("a custom FieldArrayFormApi without validateField does not crash", () => {
    // A hand-rolled implementation of the pre-0.11 surface: no
    // validateField member at all. Ops must still work (revalidation is
    // probed and skipped) — with a mode that WOULD validate if it could.
    const store = createStore<FormState<unknown>>(() => ({
      values: { users: [] as readonly unknown[] },
      initialValues: { users: [] as readonly unknown[] },
      errors: {},
      schemaErrors: {},
      serverErrors: {},
      touched: {},
      isSubmitting: false,
      submitCount: 0,
      isValidating: {},
      isValidatingForm: false,
      mode: "onChange",
      reValidateMode: "onChange",
    }));
    const custom: FieldArrayFormApi = {
      store,
      arrayPush: (path, item) =>
        store.setState((state) => ({
          values: {
            ...(state.values as Readonly<Record<string, unknown>>),
            [path]: [
              ...((state.values as Readonly<Record<string, readonly unknown[]>>)[
                path
              ] ?? []),
              item,
            ],
          },
        })),
      arrayRemove: (path, index) =>
        store.setState((state) => ({
          values: {
            ...(state.values as Readonly<Record<string, unknown>>),
            [path]: (
              (state.values as Readonly<Record<string, readonly unknown[]>>)[
                path
              ] ?? []
            ).filter((_, i) => i !== index),
          },
        })),
      arrayInsert: () => undefined,
      arrayMove: () => undefined,
      arraySwap: () => undefined,
    };

    const { result } = renderHook(() =>
      useFieldArray<Readonly<{ email: string }>>(custom, "users"),
    );

    expect(() => {
      act(() => {
        result.current.push({ email: "a@a.com" });
      });
      act(() => {
        result.current.remove(0);
      });
    }).not.toThrow();
    expect(result.current.length).toBe(0);
  });
});
