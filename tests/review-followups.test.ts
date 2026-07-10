import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { parsePath } from "../src/core/path";
import { dateInputProps, parseDateText } from "../src/react/inputProps";

// Regression tests for the 2026-07 review's lower-priority findings (#6–#9).
// #10 (gate variant-field WRITES on the discriminant) is a usage contract —
// the runtime is correct for the intended pattern — documented in
// useVariantField.ts rather than enforced here.

describe("#6 devtools is non-production only", () => {
  it("opting in under production still constructs and works (enabled=false)", () => {
    const prev = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      const form = createForm(z.object({ name: z.string() }), {
        initialValues: { name: "" },
        devtools: "checkout",
      });
      form.setValue("name", "x");
      expect(form.getState().values.name).toBe("x");
    } finally {
      process.env["NODE_ENV"] = prev;
    }
  });
});

describe("#7 parseDateText accepts years under 100", () => {
  it("parses low years to the literal year, still rejects rollovers", () => {
    const a = parseDateText("0099-01-01");
    expect(a.kind === "date" && a.value.getFullYear()).toBe(99);
    const b = parseDateText("0050-06-15");
    expect(b.kind === "date" && b.value.getFullYear()).toBe(50);
    expect(parseDateText("2026-02-31").kind).toBe("invalid");
    expect(parseDateText("0099-13-01").kind).toBe("invalid");
  });
});

describe("#8 date field preserves time-of-day (no spurious dirty)", () => {
  const schema = z.object({ when: z.date() });
  const bind = (initial: Date, setWhen: (v: Date) => void) =>
    dateInputProps({
      path: "when",
      value: initial,
      emptyValue: undefined,
      setValue: setWhen,
      onBlur: () => {},
    } as never);

  it("re-picking the same day on a timestamped value stays not-dirty", () => {
    const initial = new Date(2026, 6, 10, 14, 30, 15);
    const form = createForm(schema, { initialValues: { when: initial } });
    bind(initial, (v) => form.setValue("when", v)).onChange({ target: { value: "2026-07-10" } } as never);
    expect(form.getState().values.when.getTime()).toBe(initial.getTime());
    expect(form.dirtyFields()).toEqual([]);
  });

  it("changing the day keeps the original time-of-day", () => {
    const initial = new Date(2026, 6, 10, 9, 5, 0);
    const form = createForm(schema, { initialValues: { when: initial } });
    bind(initial, (v) => form.setValue("when", v)).onChange({ target: { value: "2026-07-15" } } as never);
    const w = form.getState().values.when;
    expect([w.getDate(), w.getHours(), w.getMinutes()]).toEqual([15, 9, 5]);
  });
});

describe("#9 parsePath returns a frozen array", () => {
  it("mutation throws instead of corrupting the cache", () => {
    const segs = parsePath("a.b.c");
    expect(Object.isFrozen(segs)).toBe(true);
    expect(() => (segs as unknown as unknown[]).push("x")).toThrow();
    expect([...parsePath("a.b.c")]).toEqual(["a", "b", "c"]);
  });
});
