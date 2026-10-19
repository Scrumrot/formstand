import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { flattenIssues } from "../src/core/validation";

// The October 2026 review's round B core findings, each pinned by the probe
// that found it. Every block here was red on main at 387f386.

describe("flattenIssues scales linearly", () => {
  const rows = z.array(z.object({ name: z.string().min(1) }));

  it("groups and dedupes 20000 issues well under the old quadratic cost", () => {
    const issues = Array.from({ length: 20000 }, (_, i) => ({
      code: "custom" as const,
      message: i % 2 === 0 ? "even" : "odd",
      path: [i],
      input: undefined,
    }));
    const started = performance.now();
    const errors = flattenIssues(issues);
    const elapsed = performance.now() - started;
    expect(Object.keys(errors)).toHaveLength(20000);
    expect(errors["0"]).toEqual(["even"]);
    expect(errors["19999"]).toEqual(["odd"]);
    // The old accumulator spread rebuilt the whole map per issue (200
    // million property copies for this input, several seconds). A generous
    // bound still fails that by an order of magnitude without flaking on a
    // slow CI box.
    expect(elapsed).toBeLessThan(1000);
  });

  it("still dedupes repeated messages at one key and keeps own-key safety", () => {
    const issues = [
      { code: "custom" as const, message: "a", path: ["__proto__"], input: 1 },
      { code: "custom" as const, message: "a", path: ["__proto__"], input: 1 },
      { code: "custom" as const, message: "b", path: ["__proto__"], input: 1 },
      { code: "custom" as const, message: "c", path: ["constructor"], input: 1 },
    ];
    const errors = flattenIssues(issues);
    expect(Object.hasOwn(errors, "__proto__")).toBe(true);
    expect(errors["__proto__"]).toEqual(["a", "b"]);
    expect(Object.hasOwn(errors, "constructor")).toBe(true);
    expect(errors["constructor"]).toEqual(["c"]);
    expect(Object.getPrototypeOf(errors)).toBe(Object.prototype);
  });

  it("validate() on 3000 empty rows costs milliseconds, not seconds", () => {
    const form = createForm(rows, {
      initialValues: Array.from({ length: 3000 }, () => ({ name: "" })),
    });
    const started = performance.now();
    const result = form.validate();
    const elapsed = performance.now() - started;
    expect(result.kind).toBe("invalid");
    expect(Object.keys(form.getState().errors)).toHaveLength(3000);
    expect(elapsed).toBeLessThan(500);
  });

  it("addErrors with thousands of keys and validateFieldsAsync over many paths stay fast", async () => {
    const schema = z.object({
      items: z.array(z.object({ name: z.string() })),
    });
    const form = createForm(schema, {
      initialValues: {
        items: Array.from({ length: 3000 }, (_, i) => ({ name: `n${i}` })),
      },
    });
    const many = Object.fromEntries(
      Array.from({ length: 3000 }, (_, i) => [`items.${i}.name`, ["taken"]]),
    );
    const startedAdd = performance.now();
    form.addErrors(many);
    expect(performance.now() - startedAdd).toBeLessThan(500);
    expect(Object.keys(form.getState().serverErrors)).toHaveLength(3000);
    // Removing through addErrors (empty lists) is the other spread site.
    const clears = Object.fromEntries(
      Array.from({ length: 3000 }, (_, i) => [`items.${i}.name`, []]),
    );
    const startedClear = performance.now();
    form.addErrors(clears);
    expect(performance.now() - startedClear).toBeLessThan(500);
    expect(Object.keys(form.getState().serverErrors)).toHaveLength(0);

    const paths = Array.from(
      { length: 3000 },
      (_, i) => `items.${i}.name` as const,
    );
    const startedAsync = performance.now();
    const result = await form.validateFieldsAsync(paths);
    expect(performance.now() - startedAsync).toBeLessThan(1500);
    expect(result.kind).toBe("valid");
    expect(form.getState().isValidating).toEqual({});
  });
});

describe("error keys named after Object.prototype members", () => {
  const keys = ["constructor", "toString", "hasOwnProperty", "__proto__"] as const;

  it.each(keys)("setError(%j) lands as an own entry and never throws", (key) => {
    const form = createForm(z.object({ name: z.string() }), {
      initialValues: { name: "" },
    });
    expect(() => form.setError(key as never, "x")).not.toThrow();
    expect(Object.hasOwn(form.getState().errors, key)).toBe(true);
    expect(form.getState().errors[key]).toEqual(["x"]);
    // A second identical write re-derives through reuseErrorRefs too.
    expect(() => form.setError(key as never, "x")).not.toThrow();
    expect(() => form.setError(key as never, [])).not.toThrow();
    expect(Object.hasOwn(form.getState().errors, key)).toBe(false);
  });

  it.each(keys)("addErrors({ %j }) lands and clears as an own entry", (key) => {
    const form = createForm(z.object({ name: z.string() }), {
      initialValues: { name: "" },
    });
    expect(() => form.addErrors({ [key]: ["x"] })).not.toThrow();
    expect(form.getState().errors[key]).toEqual(["x"]);
    expect(() => form.addErrors({ [key]: [] })).not.toThrow();
    expect(Object.hasOwn(form.getState().errors, key)).toBe(false);
  });

  it("validate() on a schema with a `constructor` field writes its error", () => {
    const schema = z.object({ constructor: z.string().min(1) });
    const form = createForm(schema, { initialValues: { constructor: "" } });
    expect(() => form.validate()).not.toThrow();
    expect(form.getState().errors["constructor"]).toEqual([
      expect.any(String),
    ]);
    // A second pass with the same verdict goes through reuseErrorRefs.
    expect(() => form.validate()).not.toThrow();
    form.setValue("constructor", "ok");
    expect(form.validate().kind).toBe("valid");
    expect(Object.hasOwn(form.getState().errors, "constructor")).toBe(false);
  });

  it.each(keys)("getFieldState(%j) reads undefined/false, not prototype members", (key) => {
    const form = createForm(z.object({ name: z.string() }), {
      initialValues: { name: "" },
    });
    const field = form.getFieldState(key as never);
    expect(field.error).toBeUndefined();
    expect(field.touched).toBe(false);
    expect(field.isValidating).toBe(false);
  });
});

// A promise settled by hand, so a test controls exactly when an async
// refine resolves relative to the writes it races.
const deferred = <T,>() => {
  const slot: { resolve: (value: T) => void } = { resolve: () => {} };
  const promise = new Promise<T>((resolve) => {
    slot.resolve = resolve;
  });
  return { promise, resolve: (value: T) => slot.resolve(value) };
};

describe("an async field verdict survives an unrelated field's change", () => {
  const build = () => {
    const gate = deferred<boolean>();
    const schema = z.object({
      username: z.string().refine(() => gate.promise, "taken"),
      email: z.string(),
    });
    const form = createForm(schema, {
      initialValues: { username: "", email: "" },
    });
    return { gate, form };
  };

  it("commits the username verdict when email changed in flight", async () => {
    const { gate, form } = build();
    form.setValue("username", "taken");
    const pending = form.validateFieldAsync("username");
    expect(form.getState().isValidating["username"]).toBe(true);
    form.setValue("email", "someone@example.com");
    gate.resolve(false);
    const result = await pending;
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
    expect(form.getState().isValidating).toEqual({});
  });

  it("still discards the verdict when the field itself changed in flight", async () => {
    const { gate, form } = build();
    form.setValue("username", "taken");
    const pending = form.validateFieldAsync("username");
    form.setValue("username", "free");
    gate.resolve(false);
    const result = await pending;
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors["username"]).toBeUndefined();
    expect(form.getState().isValidating).toEqual({});
  });

  it("keeps the whole-values compare for a full-form scope (cross-field refine)", async () => {
    const gate = deferred<boolean>();
    const schema = z
      .object({ a: z.string(), b: z.string() })
      .refine(() => gate.promise, { message: "pair", path: ["a"] });
    const form = createForm(schema, { initialValues: { a: "", b: "" } });
    const pending = form.validateFieldAsync("a");
    // The refine reads b too, so b changing in flight stales a's verdict.
    form.setValue("b", "changed");
    gate.resolve(false);
    await pending;
    expect(form.getState().errors["a"]).toBeUndefined();
    expect(form.getState().isValidating).toEqual({});
  });
});
