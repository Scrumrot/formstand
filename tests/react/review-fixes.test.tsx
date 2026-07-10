import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SelectField } from "../../src/react/fields";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

afterEach(cleanup);

// Regression tests for the 2026-07 full-repo review findings (react side).

const nullableSchema = z.object({
  plan: z.enum(["basic", "pro"]).nullable(),
});

type PlanValues = Readonly<{ plan: "basic" | "pro" | null }>;

const planState: { read: (() => PlanValues) | null } = { read: null };

const NullableHarness = () => {
  const form = useForm(nullableSchema, { initialValues: { plan: null } });
  planState.read = () => form.getState().values as PlanValues;
  return (
    <SelectField
      form={form}
      path="plan"
      label="Plan"
      placeholder="No plan"
      options={[
        { value: "basic", label: "Basic" },
        { value: "pro", label: "Pro" },
      ]}
    />
  );
};

describe("SelectField nullable clear-back", () => {
  it("keeps the empty option selectable and writes null on clear", () => {
    render(<NullableHarness />);
    const select = screen.getByLabelText("Plan") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "pro" } });
    expect(planState.read?.().plan).toBe("pro");

    // The empty option must still be there and NOT disabled — clearing a
    // nullable enum through the UI is the emptyValue round-trip.
    const empty = Array.from(select.options).find((o) => o.value === "");
    expect(empty).toBeDefined();
    expect(empty?.disabled).toBe(false);

    fireEvent.change(select, { target: { value: "" } });
    expect(planState.read?.().plan).toBe(null);
  });

  it("non-nullable enums keep a disabled placeholder", () => {
    // Optional (emptyValue undefined) — clearing isn't representable in a
    // select, so the placeholder must stay disabled.
    const requiredSchema = z.object({
      theme: z.enum(["light", "dark"]).optional(),
    });
    const Harness = () => {
      const form = useForm(requiredSchema, { initialValues: {} });
      return (
        <SelectField
          form={form}
          path="theme"
          label="Theme"
          placeholder="Pick one"
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      );
    };
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    const empty = Array.from(select.options).find((o) => o.value === "");
    expect(empty?.disabled).toBe(true);
  });
});

describe("useFieldArray remove+push in one batch", () => {
  const arraySchema = z.object({
    users: z.array(z.object({ name: z.string() })),
  });

  it("mints a fresh id for the appended row instead of reusing the removed row's", () => {
    const { result } = renderHook(() => {
      const form = useForm(arraySchema, {
        initialValues: { users: [{ name: "a" }, { name: "b" }] },
      });
      return { users: useFieldArray(form, "users") };
    });

    const [idA, idB] = result.current.users.fields.map((f) => f.id);

    act(() => {
      result.current.users.remove(0);
      result.current.users.push({ name: "" });
    });

    const ids = result.current.users.fields.map((f) => f.id);
    // b keeps its id (genuine survivor); the new blank row must NOT inherit
    // the deleted row's id — that made React reorder the dead row's DOM
    // state into the fresh row.
    expect(ids[0]).toBe(idB);
    expect(ids[1]).not.toBe(idA);
    expect(ids[1]).not.toBe(idB);
  });

  it("an in-place edit still keeps its row id (same-index fallback)", () => {
    const { result } = renderHook(() => {
      const form = useForm(arraySchema, {
        initialValues: { users: [{ name: "a" }, { name: "b" }] },
      });
      return {
        form,
        users: useFieldArray(form, "users"),
      };
    });
    const [idA, idB] = result.current.users.fields.map((f) => f.id);

    act(() => {
      // A raw value write that replaces row 0's object without touching the
      // array ops — the reconcile fallback path.
      result.current.form.setValue("users.0", { name: "edited" });
    });

    const ids = result.current.users.fields.map((f) => f.id);
    expect(ids[0]).toBe(idA);
    expect(ids[1]).toBe(idB);
  });
});

describe("useForm warns when initial values change after mount", () => {
  it("warns once for async-arriving initialValues with a stable schema", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const schema = z.object({ name: z.string() });
    const { rerender } = renderHook(
      ({ data }: Readonly<{ data: { name: string } | null }>) =>
        useForm(schema, { initialValues: data ?? { name: "" } }),
      { initialProps: { data: null as { name: string } | null } },
    );
    expect(warn).not.toHaveBeenCalled();

    rerender({ data: { name: "from the fetch" } });
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("adoptValues");
    warn.mockRestore();
  });

  it("stays silent for inline options with identical content", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const schema = z.object({ name: z.string() });
    const { rerender } = renderHook(() =>
      // A fresh object literal every render — same content, no warning.
      useForm(schema, { initialValues: { name: "stable" } }),
    );
    rerender();
    rerender();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
