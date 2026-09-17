import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { type PersistStorage } from "../../src/core/persist";
import { createFormHooks } from "../../src/react/createFormHooks";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";
import { useIsValidating } from "../../src/react/useFormFlags";
import { usePersistForm } from "../../src/react/usePersistForm";

// The 2026-09 review's ergonomics round, each piece pinned where it was
// hand-rolled before.

const schema = z.object({
  users: z.array(z.object({ name: z.string() })).max(2, "too many"),
  note: z.string(),
});

const initialValues = { users: [], note: "" };

describe("useFieldArray parity with its siblings", () => {
  it("exposes path and firstError", () => {
    const { result } = renderHook(() => {
      // onChange: the ops' revalidation gate is open from the start, so
      // the array-level max error is live without a submit.
      const form = useForm(schema, { initialValues, mode: "onChange" });
      return { form, users: useFieldArray(form, "users") };
    });
    expect(result.current.users.path).toBe("users");
    expect(result.current.users.firstError).toBeUndefined();
    act(() => {
      result.current.users.push({ name: "a" });
      result.current.users.push({ name: "b" });
      result.current.users.push({ name: "c" });
    });
    // The array-level max error surfaces through the shorthand.
    expect(result.current.users.firstError).toBe("too many");
    expectTypeOf(result.current.users.firstError).toEqualTypeOf<
      string | undefined
    >();
  });

  it("owns the array-level server channel via setError/clearError", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return { form, users: useFieldArray(form, "users") };
    });
    act(() => result.current.users.setError("too many rows for your plan"));
    expect(result.current.users.error).toEqual([
      "too many rows for your plan",
    ]);
    expect(result.current.form.getState().serverErrors["users"]).toEqual([
      "too many rows for your plan",
    ]);
    act(() => result.current.users.clearError());
    expect(result.current.users.error).toBeUndefined();
  });
});

describe("form.addErrors merges into the server channel", () => {
  it("merges runtime-keyed maps without touching existing entries", () => {
    const form = createForm(schema, { initialValues });
    form.setError("note", "first");
    // The server-response shape, as-is — no per-key casts.
    form.addErrors({ users: ["too many"], "": ["account limit"] });
    expect(form.getState().serverErrors).toEqual({
      note: ["first"],
      users: ["too many"],
      "": ["account limit"],
    });
    // An empty array removes its key, like setError; others survive.
    form.addErrors({ note: [] });
    expect(form.getState().serverErrors).toEqual({
      users: ["too many"],
      "": ["account limit"],
    });
  });
});

describe("submit failures are observable", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("onError receives the thrown value; the result still resolves error", async () => {
    const form = createForm(schema, { initialValues });
    const seen: unknown[] = [];
    const boom = new Error("save failed");
    const result = await form.submit(
      () => {
        throw boom;
      },
      undefined,
      { onError: (error) => seen.push(error) },
    );
    expect(result).toEqual({ kind: "error", error: boom });
    expect(seen).toEqual([boom]);
  });

  it("the event-handler form warns in dev when nothing observes the failure", async () => {
    const form = createForm(schema, { initialValues });
    const handler = form.handleSubmit(() => {
      throw new Error("save failed");
    });
    await handler();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("nothing observed it"),
      expect.any(Error),
    );
    vi.mocked(console.warn).mockClear();
    // With onError provided, the warning stays silent.
    const observed = form.handleSubmit(
      () => {
        throw new Error("save failed");
      },
      undefined,
      { onError: () => undefined },
    );
    await observed();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("useIsValidating", () => {
  it("reads false when nothing is in flight", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues });
      return useIsValidating(form);
    });
    expect(result.current).toBe(false);
  });
});

describe("createFormHooks additions", () => {
  const boundForm = createForm(schema, { initialValues });
  const hooks = createFormHooks(boundForm, "acct");

  it("binds useAcctValues, useAcctFields, and useAcctIsValidating", () => {
    const { result } = renderHook(() => ({
      values: hooks.useAcctValues(),
      pair: hooks.useAcctFields(["note", "users"]),
      validating: hooks.useAcctIsValidating(),
    }));
    expectTypeOf(result.current.values.note).toEqualTypeOf<string>();
    expect(result.current.values).toEqual(initialValues);
    const [note] = result.current.pair.fields;
    expectTypeOf(note.value).toEqualTypeOf<string>();
    expect(note.path).toBe("note");
    expect(result.current.validating).toBe(false);
  });
});

describe("usePersistForm owns the lifecycle", () => {
  const memoryStorage = (): PersistStorage & {
    readonly map: Map<string, string>;
  } => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => {
        map.set(key, value);
      },
      removeItem: (key) => {
        map.delete(key);
      },
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes on mount, persists edits, and the stable handle clears", () => {
    const storage = memoryStorage();
    const form = createForm(schema, { initialValues });
    const { result, rerender, unmount } = renderHook(() =>
      usePersistForm(form, { key: "draft", storage, debounceMs: 0 }),
    );
    const firstHandle = result.current;
    rerender();
    // Reference-stable across renders — safe to close over in handlers.
    expect(result.current).toBe(firstHandle);

    act(() => {
      form.setValue("note", "typed");
      vi.advanceTimersByTime(1);
    });
    expect(storage.map.get("draft")).toContain("typed");

    act(() => result.current.clear());
    expect(storage.map.has("draft")).toBe(false);

    act(() => {
      form.setValue("note", "again");
      vi.advanceTimersByTime(1);
    });
    expect(storage.map.has("draft")).toBe(true);
    unmount();
    storage.map.delete("draft");
    act(() => {
      form.setValue("note", "after unmount");
      vi.advanceTimersByTime(1);
    });
    // Disposed on unmount: no further writes.
    expect(storage.map.has("draft")).toBe(false);
  });
});
