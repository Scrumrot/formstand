import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { CheckboxField } from "../../src/react/fields";
import { dateToInputText, parseNumberText } from "../../src/react/inputProps";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useFields } from "../../src/react/useFields";
import { useForm } from "../../src/react/useForm";
import { useFormAction } from "../../src/react/useFormAction";
import { useFormSteps } from "../../src/react/useFormSteps";
import { useVariantField } from "../../src/react/useVariantField";

// Regression pins for the second November 2026 review, hooks half: the
// array hook's triggers reporting a throwing refine, update() past the
// end, the wizard's stale verdict and zero-step clamp, the number and
// date text helpers, a union nested inside another union's variant, the
// per-field options on the variant and composite hooks, force on the
// action options, and CheckboxField without a label.

const settle = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe("useFieldArray", () => {
  const error = vi.spyOn(console, "error");
  const warn = vi.spyOn(console, "warn");
  beforeEach(() => {
    error.mockImplementation(() => {});
    warn.mockImplementation(() => {});
    error.mockClear();
    warn.mockClear();
  });
  afterEach(() => {
    error.mockReset();
    warn.mockReset();
  });

  // Throws for one row value only: the first sync-entry validation runs
  // the refinement through zod's sync parse (whose promise zod discards),
  // so the scope is latched on a benign value first.
  const exploding = z.object({
    tags: z.array(z.string()).refine(
      async (rows) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (rows.includes("boom")) throw new Error("lookup failed");
        return true;
      },
      { message: "n/a" },
    ),
  });

  it("the change trigger reports a throwing async refine", async () => {
    const { result } = renderHook(() => {
      const form = useForm(exploding, {
        initialValues: { tags: [] },
        mode: "onChange",
      });
      return { form, tags: useFieldArray(form, "tags") };
    });
    act(() => {
      result.current.tags.push("ok");
    });
    await settle(25);
    expect(error).not.toHaveBeenCalled();
    act(() => {
      result.current.tags.push("boom");
    });
    expect(result.current.tags.isValidating).toBe(true);
    await settle(25);
    expect(result.current.tags.isValidating).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("the blur trigger reports a throwing async refine", async () => {
    const { result } = renderHook(() => {
      const form = useForm(exploding, { initialValues: { tags: ["ok"] } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    act(() => {
      result.current.tags.onBlur();
    });
    await settle(25);
    expect(error).not.toHaveBeenCalled();
    act(() => {
      result.current.form.setValue("tags", ["boom"]);
      result.current.tags.onBlur();
    });
    await settle(25);
    expect(result.current.tags.isValidating).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("update() past the end warns and writes nothing", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: ["a", "b"] } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    act(() => {
      result.current.tags.update(5, "x");
      result.current.tags.update(-1, "x");
      result.current.tags.update(1.5, "x");
    });
    expect(result.current.form.getState().values.tags).toEqual(["a", "b"]);
    expect(warn).toHaveBeenCalledTimes(3);
    act(() => {
      result.current.tags.update(1, "c");
    });
    expect(result.current.form.getState().values.tags).toEqual(["a", "c"]);
  });

  it("validateAsync resolves the array-scoped verdict", async () => {
    const schema = z.object({ tags: z.array(z.string()).min(1, "one") });
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { tags: [] } });
      return { form, tags: useFieldArray(form, "tags") };
    });
    const verdict = await result.current.tags.validateAsync();
    expect(verdict).toEqual({ kind: "invalid", errors: ["one"] });
    expect(result.current.form.getState().errors.tags).toEqual(["one"]);
  });
});

describe("useFormSteps", () => {
  const schema = z.object({
    username: z.string().refine(
      async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return value !== "taken";
      },
      { message: "taken" },
    ),
    city: z.string(),
  });
  const STEPS = [
    { name: "account", fields: ["username"] },
    { name: "shipping", fields: ["city"] },
  ] as const;

  it("judges the step's live value when it changes mid-flight", async () => {
    const form = createForm(schema, {
      initialValues: { username: "free", city: "" },
    });
    const { result } = renderHook(() => useFormSteps(form, STEPS));
    const advance = act(() => result.current.next());
    // The user keeps typing while the async rule runs on "free".
    form.setValue("username", "taken");
    expect(await advance).toBe(false);
    expect(result.current.step).toBe(0);
    expect(form.getState().errors.username).toEqual(["taken"]);
  });

  it("resolves true and stays put with no steps", async () => {
    const form = createForm(schema, {
      initialValues: { username: "free", city: "" },
    });
    const { result } = renderHook(() => useFormSteps(form, []));
    expect(await act(() => result.current.next())).toBe(true);
    expect(result.current.step).toBe(0);
    expect(result.current.count).toBe(0);
  });
});

describe("input text helpers", () => {
  it("parseNumberText reads a trailing dot as a partial entry", () => {
    expect(parseNumberText("1.")).toEqual({ kind: "invalid" });
    expect(parseNumberText("85000.")).toEqual({ kind: "invalid" });
    expect(parseNumberText("1.5")).toEqual({ kind: "number", value: 1.5 });
    expect(parseNumberText(".5")).toEqual({ kind: "number", value: 0.5 });
    expect(parseNumberText("1e3")).toEqual({ kind: "number", value: 1000 });
  });

  it("dateToInputText renders a date-only string as the day it spells", () => {
    expect(dateToInputText("2026-03-01" as unknown as Date)).toBe("2026-03-01");
    const local = new Date(2026, 2, 1);
    expect(dateToInputText(local)).toBe("2026-03-01");
  });
});

describe("useVariantField", () => {
  const schema = z.object({
    shape: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("a"),
        detail: z.discriminatedUnion("sub", [
          z.object({ sub: z.literal("x"), x: z.string().min(2, "short") }),
          z.object({ sub: z.literal("y"), y: z.number() }),
        ]),
      }),
      z.object({ kind: z.literal("b") }),
    ]),
  });

  it("binds a union nested inside another union's variant", () => {
    const form = createForm(schema, {
      initialValues: { shape: { kind: "a", detail: { sub: "x", x: "hi" } } },
    });
    const { result } = renderHook(() =>
      useVariantField(form, "shape.detail", "x"),
    );
    expect(result.current.value).toBe("hi");
    act(() => {
      result.current.setValue("yo");
    });
    expect(form.getState().values.shape).toEqual({
      kind: "a",
      detail: { sub: "x", x: "yo" },
    });
  });

  it("takes the per-field options", async () => {
    const form = createForm(schema, {
      initialValues: { shape: { kind: "a", detail: { sub: "x", x: "hi" } } },
      mode: "onChange",
    });
    const { result } = renderHook(() =>
      useVariantField(form, "shape.detail", "x", { debounceMs: 20 }),
    );
    act(() => {
      result.current.setValue("a");
    });
    expect(form.getState().errors).toEqual({});
    await settle(40);
    expect(form.getState().errors["shape.detail.x"]).toEqual(["short"]);
  });
});

describe("useFields", () => {
  it("takes one options bag for every bound path", async () => {
    const schema = z.object({
      lat: z.number().min(-90, "lat"),
      lng: z.number().min(-180, "lng"),
    });
    const form = createForm(schema, {
      initialValues: { lat: 0, lng: 0 },
      mode: "onChange",
    });
    const { result } = renderHook(() =>
      useFields(form, ["lat", "lng"], { debounceMs: 20 }),
    );
    act(() => {
      result.current.fields[0].setValue(-100);
      result.current.fields[1].setValue(-200);
    });
    expect(form.getState().errors).toEqual({});
    await settle(40);
    expect(form.getState().errors.lat).toEqual(["lat"]);
    expect(form.getState().errors.lng).toEqual(["lng"]);
  });
});

describe("useFormAction", () => {
  it("passes force through to submit", async () => {
    const schema = z.object({ name: z.string() });
    const form = createForm(schema, { initialValues: { name: "x" } });
    const seen: string[] = [];
    const { result } = renderHook(() =>
      useFormAction(
        form,
        async (data) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          seen.push(data.name);
        },
        { force: true },
      ),
    );
    await act(async () => {
      const first = result.current(new FormData());
      const second = result.current(new FormData());
      await Promise.all([first, second]);
    });
    // Without force the second call would have resolved "skipped".
    expect(seen).toEqual(["x", "x"]);
  });
});

describe("CheckboxField", () => {
  const schema = z.object({ agree: z.boolean() });

  it("renders no label element when none is given", () => {
    const form = createForm(schema, { initialValues: { agree: false } });
    const { container } = render(<CheckboxField form={form} path="agree" />);
    expect(container.querySelector("label")).toBeNull();
    expect(container.querySelector("input[type=checkbox]")).not.toBeNull();
  });

  it("wraps the input in the label when one is given", () => {
    const form = createForm(schema, { initialValues: { agree: false } });
    const { container } = render(
      <CheckboxField form={form} path="agree" label="I agree" />,
    );
    const label = container.querySelector("label");
    expect(label?.querySelector("input[type=checkbox]")).not.toBeNull();
    expect(label?.textContent).toContain("I agree");
  });
});
