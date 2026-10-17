// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { textInputProps } from "../../src/react/inputProps";
import { useField } from "../../src/react/useField";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";
import { useFormSteps } from "../../src/react/useFormSteps";
import { type MaskedParse, useMaskedInput } from "../../src/react/useMaskedInput";
import { useVariantField } from "../../src/react/useVariantField";
import { vi } from "vitest";

// The October 2026 review's hook-level findings, each pinned by the probe
// that found it.

describe("useFieldArray: duplicate primitive rows keep their ids on an edit", () => {
  const schema = z.object({ tags: z.array(z.string()) });

  it("a keystroke into one of two identical rows keeps both ids", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: ["", ""] } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const [id0, id1] = result.current.tags.fields.map((f) => f.id);
    act(() => {
      result.current.form.setValue("tags.0", "x");
    });
    // Before the fix the value pass handed row 0's id to row 1 (the first
    // "" bucket slot) and row 0 minted, so React remounted the edited row.
    expect(result.current.tags.fields.map((f) => f.id)).toEqual([id0, id1]);
  });

  it("the focused input survives typing into a pre-populated empty list", () => {
    const Rows = () => {
      const form = useForm(schema, { initialValues: { tags: ["", ""] } });
      const tags = useFieldArray(form, "tags");
      return (
        <div>
          {tags.fields.map((row, i) => (
            <Row key={row.id} form={form} index={i} />
          ))}
        </div>
      );
    };
    const Row = ({
      form,
      index,
    }: Readonly<{ form: ReturnType<typeof useForm<typeof schema>>; index: number }>) => {
      const field = useField(form, `tags.${index}`);
      return <input data-testid={`tag-${index}`} {...textInputProps(field)} />;
    };
    render(<Rows />);
    const first = screen.getByTestId("tag-0");
    act(() => {
      first.focus();
    });
    fireEvent.change(first, { target: { value: "x" } });
    expect(screen.getByTestId("tag-0")).toBe(first);
    expect(document.activeElement).toBe(first);
  });
});

describe("useField debounceMs: blur on an untouched form still validates", () => {
  const schema = z.object({ name: z.string().min(1, "required") });

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a debounced blur on a pristine required field reports the error", async () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { name: "" } });
      return { form, name: useField(form, "name", { debounceMs: 100 }) };
    });
    act(() => {
      result.current.name.onBlur();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.name.error).toEqual(["required"]);
  });

  it("a reset inside the debounce window still cancels the pending commit", async () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { name: "ok" } });
      return { form, name: useField(form, "name", { debounceMs: 100 }) };
    });
    act(() => {
      result.current.name.setValue("");
      result.current.name.onBlur();
    });
    act(() => {
      result.current.form.reset();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.name.error).toBeUndefined();
    expect(result.current.form.getState().values).toBe(
      result.current.form.getState().initialValues,
    );
  });
});

describe("useFormSteps: back() during an async gate wins over the stale next()", () => {
  it("does not land two steps ahead", async () => {
    // The refine resolves immediately until `hold` is set: an async refine
    // makes EVERY validation pass async (the whole schema parses), so the
    // gate must only block for the one next() under test.
    const gate: { hold: boolean; release: (() => void) | null } = {
      hold: false,
      release: null,
    };
    const schema = z.object({
      a: z.string(),
      b: z.string().refine(
        () =>
          gate.hold
            ? new Promise<boolean>((resolve) => {
                gate.release = () => resolve(true);
              })
            : Promise.resolve(true),
      ),
      c: z.string(),
    });
    const steps = [
      { name: "A", fields: ["a"] },
      { name: "B", fields: ["b"] },
      { name: "C", fields: ["c"] },
    ] as const;
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { a: "", b: "", c: "" } });
      return useFormSteps(form, steps);
    });
    await act(async () => {
      await result.current.goTo(1);
    });
    expect(result.current.step).toBe(1);
    // next() is NOT wrapped in act: it must stay pending (the refine holds
    // its promise) while back() runs, which a nested act would serialize.
    gate.hold = true;
    const pending = result.current.next();
    act(() => {
      result.current.back();
    });
    expect(result.current.step).toBe(0);
    await act(async () => {
      gate.release?.();
      await pending;
    });
    // Before the fix the resolved next() applied its stale target (2).
    expect(result.current.step).toBe(0);
  });
});

describe("useMaskedInput: clearing follows the text binding's clearable rule", () => {
  const parse = (text: string): MaskedParse<string> =>
    text.trim() === "" ? { kind: "empty" } : { kind: "value", value: text };
  const format = (v: string): string => v;

  it("a required string clears back to \"\" (clean, author's message)", () => {
    const schema = z.object({ phone: z.string().min(1, "required") });
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { phone: "" },
        mode: "onChange",
      });
      const field = useField(form, "phone");
      return { form, field, masked: useMaskedInput(field, { parse, format }) };
    });
    act(() => {
      result.current.masked.onChange({ target: { value: "5" } } as never);
    });
    act(() => {
      result.current.masked.onChange({ target: { value: "" } } as never);
    });
    expect(result.current.form.getState().values.phone).toBe("");
    expect(result.current.field.dirty).toBe(false);
    expect(result.current.field.error).toEqual(["required"]);
  });

  it("an optional string still clears to its emptyValue", () => {
    const schema = z.object({ phone: z.string().optional() });
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { phone: "" } });
      const field = useField(form, "phone");
      return { form, masked: useMaskedInput(field, { parse, format }) };
    });
    act(() => {
      result.current.masked.onChange({ target: { value: "5" } } as never);
    });
    act(() => {
      result.current.masked.onChange({ target: { value: "" } } as never);
    });
    expect(result.current.form.getState().values.phone).toBeUndefined();
  });
});

describe("clearable/emptyValue introspection looks through wrappers and unions", () => {
  const schema = z.object({
    profile: z.object({ nick: z.string().optional() }).optional(),
    payment: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("card"),
        cardNumber: z.string().optional(),
        cvv: z.string().nullable(),
      }),
      z.object({ kind: z.literal("cash") }),
    ]),
  });

  it("a leaf under an optional object reads its own wrapper", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { profile: undefined, payment: { kind: "cash" } },
      });
      return useField(form, "profile.nick");
    });
    expect(result.current.clearable).toBe(true);
    expect(result.current.emptyValue).toBeUndefined();
  });

  it("variant fields report their schema's blank, not the heuristic", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: { payment: { kind: "card", cardNumber: "", cvv: "" } },
      });
      return {
        cardNumber: useVariantField(form, "payment", "cardNumber"),
        cvv: useVariantField(form, "payment", "cvv"),
      };
    });
    expect(result.current.cardNumber.clearable).toBe(true);
    expect(result.current.cardNumber.emptyValue).toBeUndefined();
    expect(result.current.cvv.clearable).toBe(true);
    expect(result.current.cvv.emptyValue).toBeNull();
  });
});
