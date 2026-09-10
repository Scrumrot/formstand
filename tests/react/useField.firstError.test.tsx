import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

// firstError: the display shorthand every adapter otherwise re-derives by
// hand (error?.[0] with the empty-array guard). Derived, never stored —
// it must track the error channel exactly.
const schema = z.object({
  username: z.string().min(3, "too short").max(8, "too long"),
});

const setup = () =>
  renderHook(() => {
    const form = useForm(schema, { initialValues: { username: "" } });
    return { form, username: useField(form, "username") };
  });

describe("useField firstError", () => {
  it("is undefined while the channel is empty, the first message otherwise", () => {
    const { result } = setup();
    expect(result.current.username.firstError).toBeUndefined();
    expectTypeOf(result.current.username.firstError).toEqualTypeOf<
      string | undefined
    >();

    act(() => {
      result.current.username.setError(["too short", "also bad"]);
    });
    expect(result.current.username.error).toEqual(["too short", "also bad"]);
    expect(result.current.username.firstError).toBe("too short");

    act(() => result.current.username.clearError());
    expect(result.current.username.firstError).toBeUndefined();
  });

  it("guards the empty-array shape, matching the adapters it replaces", () => {
    const { result } = setup();
    act(() => result.current.username.setError([]));
    // An empty channel array is not a message.
    expect(result.current.username.firstError).toBeUndefined();
  });

  it("tracks validation-produced errors", () => {
    const { result } = setup();
    act(() => {
      result.current.username.validate();
    });
    expect(result.current.username.firstError).toBe("too short");
  });
});
