import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import type { FormState } from "../../src/core/types";
import { type FieldFormApi, useField } from "../../src/react/useField";

// A custom FieldFormApi written against the pre-0.4 surface, where
// `setError` only ever received `readonly string[]`. Its implementation
// calls `errors.map` — if the hook forwarded the 0.4 string shorthand as a
// bare string, this would throw "errors.map is not a function". The hook
// must normalize the shorthand to a one-element array BEFORE forwarding.
const makeLegacyForm = () => {
  const store = createStore<FormState<unknown>>(() => ({
    values: { username: "" },
    initialValues: { username: "" },
    errors: {},
    schemaErrors: {},
    serverErrors: {},
    touched: {},
    isSubmitting: false,
    submitCount: 0,
    isValidating: {},
    isValidatingForm: false,
    mode: "onBlur",
    reValidateMode: "onChange",
  }));
  const received: Array<readonly string[]> = [];
  const form: FieldFormApi = {
    store,
    setValue() {},
    setTouched() {},
    setError(_path: string, errors: readonly string[]) {
      received.push(errors.map((m) => m));
    },
    clearErrors() {},
    validateField() {
      return { kind: "valid" as const };
    },
    validateFieldAsync() {
      return Promise.resolve({ kind: "valid" as const });
    },
  };
  return { form, received };
};

describe("useField setError forwarder normalizes the string shorthand", () => {
  it('field.setError("taken") reaches the form as a one-element array', () => {
    const { form, received } = makeLegacyForm();
    const { result } = renderHook(() =>
      useField<string>(form, "username"),
    );
    act(() => {
      result.current.setError("taken");
    });
    expect(received).toEqual([["taken"]]);
  });

  it("passes arrays through unchanged", () => {
    const { form, received } = makeLegacyForm();
    const { result } = renderHook(() =>
      useField<string>(form, "username"),
    );
    act(() => {
      result.current.setError(["taken", "reserved"]);
    });
    expect(received).toEqual([["taken", "reserved"]]);
  });
});
