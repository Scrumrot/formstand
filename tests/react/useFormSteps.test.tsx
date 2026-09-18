import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFormHooks } from "../../src/react/createFormHooks";
import { createForm } from "../../src/core/createForm";
import { useForm } from "../../src/react/useForm";
import { useFormSteps } from "../../src/react/useFormSteps";

// The wizard hook: one form, per-step validation scopes. next() gates on
// the CURRENT step's fields validating clean (cross-field refines inside
// the step fire — the full schema parses, errors are scoped), a failed
// advance marks the errored fields touched like a failed submit, back()
// never validates, and forward goTo() lands on the first failing step.

const schema = z
  .object({
    email: z.string().email("not an email"),
    password: z.string().min(8, "at least 8"),
    confirm: z.string(),
    city: z.string().min(1, "required"),
    agree: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm) {
      ctx.addIssue({
        code: "custom",
        path: ["confirm"],
        message: "passwords must match",
      });
    }
  });

const STEPS = [
  { name: "account", fields: ["email", "password", "confirm"] },
  { name: "shipping", fields: ["city"] },
  { name: "review", fields: ["agree"] },
] as const;

const goodValues = {
  email: "tim@example.com",
  password: "hunter2hunter2",
  confirm: "hunter2hunter2",
  city: "Dayton",
  agree: true,
};

const bind = (initialValues: typeof goodValues) =>
  renderHook(() => {
    const form = useForm(schema, { initialValues });
    return { form, steps: useFormSteps(form, STEPS) };
  });

describe("useFormSteps", () => {
  it("advances through valid steps and reports position", async () => {
    const { result } = bind(goodValues);
    expect(result.current.steps.step).toBe(0);
    expect(result.current.steps.name).toBe("account");
    expect(result.current.steps.count).toBe(3);
    expect(result.current.steps.isFirst).toBe(true);

    await act(async () => {
      expect(await result.current.steps.next()).toBe(true);
    });
    expect(result.current.steps.step).toBe(1);
    await act(async () => {
      expect(await result.current.steps.next()).toBe(true);
    });
    expect(result.current.steps.step).toBe(2);
    expect(result.current.steps.isLast).toBe(true);
    expect(result.current.steps.steps.map((s) => s.visited)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("a failing step refuses to advance, scopes its errors, and marks them touched", async () => {
    const { result } = bind({ ...goodValues, email: "nope", city: "" });
    await act(async () => {
      expect(await result.current.steps.next()).toBe(false);
    });
    expect(result.current.steps.step).toBe(0);
    const state = result.current.form.getState();
    expect(state.errors["email"]).toEqual(["not an email"]);
    // The step only re-judged ITS paths: city's problem is not written yet.
    expect(state.errors["city"]).toBeUndefined();
    // Failed-advance parity with failed submit: errored fields read touched.
    expect(state.touched["email"]).toBe(true);
  });

  it("a cross-field refine INSIDE a step gates the advance", async () => {
    const { result } = bind({ ...goodValues, confirm: "different" });
    await act(async () => {
      expect(await result.current.steps.next()).toBe(false);
    });
    expect(result.current.form.getState().errors["confirm"]).toEqual([
      "passwords must match",
    ]);
  });

  it("back() never validates; forward goTo lands on the first failing step", async () => {
    const { result } = bind({ ...goodValues, city: "" });
    // Jump for step 2 from step 0: account validates clean, shipping does
    // not — land on shipping with its error visible.
    await act(async () => {
      expect(await result.current.steps.goTo(2)).toBe(1);
    });
    expect(result.current.steps.step).toBe(1);
    expect(result.current.form.getState().errors["city"]).toEqual([
      "required",
    ]);
    // Backward is free even while the current step is broken.
    act(() => {
      result.current.steps.back();
    });
    expect(result.current.steps.step).toBe(0);
    // hasErrors stays live for the broken step we left.
    expect(result.current.steps.steps[1]?.hasErrors).toBe(true);
  });

  it("next() on the last step validates without advancing", async () => {
    const { result } = bind(goodValues);
    await act(async () => {
      await result.current.steps.goTo(2);
    });
    expect(result.current.steps.step).toBe(2);
    await act(async () => {
      expect(await result.current.steps.next()).toBe(true);
    });
    expect(result.current.steps.step).toBe(2);
  });

  it("createFormHooks binds use{Name}Steps", async () => {
    const form = createForm(schema, { initialValues: goodValues });
    const { useCheckoutSteps } = createFormHooks(form, "checkout");
    const { result } = renderHook(() => useCheckoutSteps(STEPS));
    expect(result.current.count).toBe(3);
    await act(async () => {
      expect(await result.current.next()).toBe(true);
    });
    expect(result.current.step).toBe(1);
  });
});
