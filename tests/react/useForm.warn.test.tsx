import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useForm } from "../../src/react/useForm";

afterEach(cleanup);

describe("useForm schema-change warning", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns once when a different schema reference arrives after mount", () => {
    const a = z.object({ name: z.string() });
    const b = z.object({ name: z.string() });
    const { rerender } = renderHook(
      ({ schema }) => useForm(schema, { initialValues: { name: "" } }),
      { initialProps: { schema: a } },
    );
    expect(console.warn).not.toHaveBeenCalled();
    rerender({ schema: b });
    rerender({ schema: b });
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("stays silent when the schema reference is stable", () => {
    const schema = z.object({ name: z.string() });
    const { rerender } = renderHook(() =>
      useForm(schema, { initialValues: { name: "" } }),
    );
    rerender();
    rerender();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
