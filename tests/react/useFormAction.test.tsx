import { act, renderHook } from "@testing-library/react";
import { startTransition } from "react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { useForm } from "../../src/react/useForm";
import {
  useFormAction,
  useFormActionState,
} from "../../src/react/useFormAction";

// The React 19 form-actions bridge: the action world gets the same
// contract onSubmit callers have — validation before the handler runs,
// submit-state tracking, errors written and marked touched on a failed
// submit — with parsed z.output data instead of FormData, plus the raw
// FormData as the trailing argument for what only it carries.

afterEach(() => {
  vi.restoreAllMocks();
});

const schema = z.object({
  email: z.string().email("not an email"),
  age: z.number().min(18, "adults only"),
});

const validInitials = { email: "tim@example.com", age: 44 };

describe("useFormAction", () => {
  it("validates first and hands the handler parsed data plus the FormData", async () => {
    const seen: unknown[] = [];
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: validInitials });
      return {
        form,
        action: useFormAction(form, (data, formData) => {
          seen.push(data, formData);
          expectTypeOf(data).toEqualTypeOf<{ email: string; age: number }>();
        }),
      };
    });
    const fd = new FormData();
    await act(() => result.current.action(fd));
    expect(seen[0]).toEqual(validInitials);
    expect(seen[1]).toBe(fd);
    expect(result.current.form.getState().submitCount).toBe(1);
  });

  it("a failing submission writes errors, marks touched, and never runs the handler", async () => {
    const onValid = vi.fn();
    const onInvalid = vi.fn();
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { email: "nope", age: 3 },
      });
      return {
        form,
        action: useFormAction(form, onValid, { onInvalid }),
      };
    });
    await act(() => result.current.action(new FormData()));
    expect(onValid).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledOnce();
    const state = result.current.form.getState();
    expect(state.errors["email"]).toEqual(["not an email"]);
    expect(state.touched["age"]).toBe(true);
  });

  it("is reference-stable across renders with inline handlers", async () => {
    const calls: string[] = [];
    const { result, rerender } = renderHook(
      ({ tag }: { tag: string }) => {
        const form = useForm(schema, { initialValues: validInitials });
        return useFormAction(form, () => {
          calls.push(tag);
        });
      },
      { initialProps: { tag: "first" } },
    );
    const stable = result.current;
    rerender({ tag: "second" });
    expect(result.current).toBe(stable);
    // The stable identity still sees the LATEST handler, not the one from
    // the render that created it.
    await act(() => stable(new FormData()));
    expect(calls).toEqual(["second"]);
  });

  it("dev-warns when the handler throws with nothing observing it, and stays quiet with onError", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const boom = new Error("save failed");
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: validInitials });
      return {
        silent: useFormAction(form, () => {
          throw boom;
        }),
        observed: useFormAction(
          form,
          () => {
            throw boom;
          },
          { onError: () => {} },
        ),
      };
    });
    await act(() => result.current.silent(new FormData()));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockClear();
    await act(() => result.current.observed(new FormData()));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("useFormActionState", () => {
  it("threads prevState and parsed data through to the next state", async () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: validInitials });
      return useFormActionState(
        form,
        (prev: readonly string[], data) => [...prev, data.email],
        [] as readonly string[],
      );
    });
    expect(result.current[0]).toEqual([]);
    await act(async () => {
      startTransition(() => result.current[1](new FormData()));
    });
    expect(result.current[0]).toEqual(["tim@example.com"]);
    await act(async () => {
      startTransition(() => result.current[1](new FormData()));
    });
    expect(result.current[0]).toEqual([
      "tim@example.com",
      "tim@example.com",
    ]);
  });

  it("an invalid submission keeps the previous state (errors live in the form)", async () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { email: "nope", age: 3 },
      });
      return {
        form,
        state: useFormActionState(
          form,
          () => "submitted" as string,
          "untouched" as string,
        ),
      };
    });
    await act(async () => {
      startTransition(() => result.current.state[1](new FormData()));
    });
    expect(result.current.state[0]).toBe("untouched");
    expect(result.current.form.getState().errors["email"]).toEqual([
      "not an email",
    ]);
  });

  it("a throwing handler keeps the previous state and calls onError", async () => {
    const onError = vi.fn();
    const boom = new Error("nope");
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: validInitials });
      return useFormActionState(
        form,
        () => {
          throw boom;
        },
        "before" as string,
        { onError },
      );
    });
    await act(async () => {
      startTransition(() => result.current[1](new FormData()));
    });
    expect(result.current[0]).toBe("before");
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it("the handler runs inside the submit lifecycle and pending settles", async () => {
    // act() cannot pause React mid-transition to read isPending, so the
    // observable proof that the bridge rides the submit lifecycle is the
    // STORE's flag: isSubmitting is true while the handler runs, and the
    // React-side isPending has settled back to false when act returns.
    const seen: boolean[] = [];
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: validInitials });
      const state = useFormActionState(
        form,
        async () => {
          seen.push(form.getState().isSubmitting);
          return "done";
        },
        "idle" as string,
      );
      return { form, state };
    });
    await act(async () => {
      startTransition(() => result.current.state[1](new FormData()));
    });
    expect(seen).toEqual([true]);
    expect(result.current.form.getState().isSubmitting).toBe(false);
    expect(result.current.state[2]).toBe(false);
    expect(result.current.state[0]).toBe("done");
  });
});
