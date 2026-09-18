import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";
import {
  type MaskedParse,
  useMaskedInput,
} from "../../src/react/useMaskedInput";

// useMaskedInput: useNumberInput's raw-text pattern for ANY parsed and
// formatted value. Partial entries stay visible without touching the
// form, complete entries push immediately, blur snaps to the canonical
// format, and an external write wins over local text.

// A toy US-phone mask: value is the 10 digits, display is (xxx) xxx-xxxx.
const parsePhone = (text: string): MaskedParse<string> => {
  const digits = text.replace(/\D/g, "");
  if (text.trim() === "") return { kind: "empty" };
  if (digits.length === 10) return { kind: "value", value: digits };
  return { kind: "invalid" };
};
const formatPhone = (digits: string): string =>
  `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;

const schema = z.object({
  phone: z.string().length(10, "ten digits").optional(),
});

const bind = () =>
  renderHook(() => {
    const form = useForm(schema, { initialValues: { phone: "9375550100" } });
    const field = useField(form, "phone");
    return {
      form,
      field,
      input: useMaskedInput(field, {
        parse: parsePhone,
        format: formatPhone,
      }),
    };
  });

const type = (
  result: Readonly<{
    current: Readonly<{ input: Readonly<{ onChange: (e: never) => void }> }>;
  }>,
  value: string,
) => {
  act(() => {
    (result.current.input.onChange as (e: unknown) => void)({
      target: { value },
    });
  });
};

describe("useMaskedInput", () => {
  it("displays the canonical format when idle", () => {
    const { result } = bind();
    expect(result.current.input.value).toBe("(937) 555-0100");
    expect(result.current.input.name).toBe("phone");
  });

  it("keeps partial text visible without touching the form value", () => {
    const { result } = bind();
    type(result, "937");
    expect(result.current.input.value).toBe("937");
    expect(result.current.field.value).toBe("9375550100");
  });

  it("pushes as soon as the text parses, keeping the raw spelling", () => {
    const { result } = bind();
    type(result, "937-555-0199");
    expect(result.current.field.value).toBe("9375550199");
    expect(result.current.input.value).toBe("937-555-0199");
  });

  it("blur snaps the display to the canonical format", () => {
    const { result } = bind();
    type(result, "937-555-0199");
    act(() => result.current.input.onBlur());
    expect(result.current.input.value).toBe("(937) 555-0199");
    expect(result.current.field.touched).toBe(true);
  });

  it("empty pushes the field's emptyValue (undefined for optional)", () => {
    const { result } = bind();
    type(result, "");
    expect(result.current.field.value).toBe(undefined);
  });

  it("an external write wins over local partial text", () => {
    const { result } = bind();
    type(result, "93");
    act(() => {
      result.current.form.setValue("phone", "9375550111");
    });
    expect(result.current.input.value).toBe("(937) 555-0111");
  });
});
