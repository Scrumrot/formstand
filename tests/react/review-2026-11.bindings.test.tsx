import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { DateField } from "../../src/react/fields";
import { dateToInputText, parseNumberText } from "../../src/react/inputProps";
import { useField } from "../../src/react/useField";
import { useFields } from "../../src/react/useFields";
import { useForm } from "../../src/react/useForm";
import { useFormSteps } from "../../src/react/useFormSteps";
import {
  type MaskedParse,
  useMaskedInput,
} from "../../src/react/useMaskedInput";

// Regression pins for the November 2026 review, hooks and bindings half.

describe("dateToInputText with a value that is not a Date", () => {
  it("reads a persisted ISO string as a date for display", () => {
    expect(
      dateToInputText("2026-06-01T12:00:00.000Z" as unknown as Date),
    ).toBe("2026-06-01");
    expect(dateToInputText("not a date" as unknown as Date)).toBe("");
  });

  it("DateField renders instead of throwing after a draft loads a string", () => {
    const form = createForm(z.object({ when: z.date() }), {
      initialValues: { when: new Date(2026, 0, 15) },
    });
    form.adoptValues({ when: "2026-06-01T12:00:00.000Z" as unknown as Date });
    render(<DateField form={form} path="when" label="When" />);
    expect(screen.getByLabelText("When")).toHaveProperty("value", "2026-06-01");
  });
});

describe("parseNumberText reads decimal notation only", () => {
  it("rejects hex, octal, binary and Infinity spellings", () => {
    expect(parseNumberText("0x10")).toEqual({ kind: "invalid" });
    expect(parseNumberText("0b11")).toEqual({ kind: "invalid" });
    expect(parseNumberText("0o7")).toEqual({ kind: "invalid" });
    expect(parseNumberText("Infinity")).toEqual({ kind: "invalid" });
    expect(parseNumberText("-Infinity")).toEqual({ kind: "invalid" });
  });

  it("keeps the decimal forms it always accepted", () => {
    expect(parseNumberText("42")).toEqual({ kind: "number", value: 42 });
    expect(parseNumberText("-5.25")).toEqual({ kind: "number", value: -5.25 });
    expect(parseNumberText(".5")).toEqual({ kind: "number", value: 0.5 });
    expect(parseNumberText("1.")).toEqual({ kind: "number", value: 1 });
    expect(parseNumberText("1e3")).toEqual({ kind: "number", value: 1000 });
    expect(parseNumberText(" 7 ")).toEqual({ kind: "number", value: 7 });
    expect(parseNumberText("   ")).toEqual({ kind: "empty" });
    expect(parseNumberText("-")).toEqual({ kind: "invalid" });
    expect(parseNumberText("1e")).toEqual({ kind: "invalid" });
    expect(parseNumberText("1e400")).toEqual({ kind: "invalid" });
  });
});

describe("useFormSteps.goTo with a target that is not a finite number", () => {
  const schema = z.object({
    email: z.string().min(1, "required"),
    city: z.string(),
    agree: z.boolean(),
  });
  const STEPS = [
    { fields: ["email"] },
    { fields: ["city"] },
    { fields: ["agree"] },
  ] as const;

  it("resolves the current index instead of recursing", async () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { email: "", city: "", agree: false },
      });
      return useFormSteps(form, STEPS);
    });
    const landed = await act(() => result.current.goTo(Number("")));
    expect(landed).toBe(0);
    expect(result.current.step).toBe(0);
    const far = await act(() => result.current.goTo(Infinity));
    expect(far).toBe(0);
    // A fractional target still walks: 1.9 means step 1.
    const back = await act(() => result.current.goTo(-3));
    expect(back).toBe(0);
  });
});

describe("useMaskedInput clears a required string whose key was omitted", () => {
  const parsePhone = (text: string): MaskedParse<string> => {
    const digits = text.replace(/\D/g, "");
    if (text.trim() === "") return { kind: "empty" };
    if (digits.length === 10) return { kind: "value", value: digits };
    return { kind: "invalid" };
  };
  const formatPhone = (digits: string): string =>
    `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;

  it("writes back an empty string, not undefined", () => {
    const schema = z.object({ phone: z.string().min(1, "phone required") });
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {} as { phone: string },
      });
      const field = useField(form, "phone");
      return {
        form,
        field,
        input: useMaskedInput(field, { parse: parsePhone, format: formatPhone }),
      };
    });
    const type = (value: string) => {
      act(() => {
        (result.current.input.onChange as (e: unknown) => void)({
          target: { value },
        });
      });
    };
    type("9375550100");
    expect(result.current.form.getState().values.phone).toBe("9375550100");
    type("");
    expect(result.current.form.getState().values.phone).toBe("");
    expect(Object.hasOwn(result.current.form.getState().values, "phone")).toBe(
      true,
    );
  });
});

describe("useField blur validates at once even with debounceMs", () => {
  const calls = { count: 0 };
  const schema = z.object({
    name: z.string().refine(
      (v) => {
        calls.count += 1;
        return v.length > 0;
      },
      { message: "required" },
    ),
  });

  beforeEach(() => {
    calls.count = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops the pending change timer and validates on blur", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { name: "Ada" },
        mode: "all",
      });
      return useField(form, "name", { debounceMs: 50 });
    });
    act(() => {
      result.current.setValue("");
    });
    expect(result.current.error).toBeUndefined();
    expect(calls.count).toBe(0);
    act(() => {
      result.current.onBlur();
    });
    expect(result.current.error).toEqual(["required"]);
    expect(calls.count).toBe(1);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // The change timer was dropped: no second run.
    expect(calls.count).toBe(1);
  });
});

describe("useFields keeps its identity", () => {
  it("returns the same object until one of its fields changes", () => {
    const form = createForm(
      z.object({ latitude: z.number(), longitude: z.number() }),
      { initialValues: { latitude: 0, longitude: 0 } },
    );
    const { result, rerender } = renderHook(() =>
      useFields(form, ["latitude", "longitude"]),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.fields).toBe(first.fields);
    expect(result.current.onBlur).toBe(first.onBlur);
    act(() => {
      form.setValue("latitude", 51.5);
    });
    expect(result.current).not.toBe(first);
    expect(result.current.fields[0].value).toBe(51.5);
    expect(result.current.dirty).toBe(true);
  });
});
