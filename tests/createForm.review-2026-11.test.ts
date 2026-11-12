import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

// Regression pins for the November 2026 whole-library review, core half:
// a throwing async refinement must release the in-flight flags it set, a
// field-scoped pass that parses the whole form must drop the stale errors
// that parse no longer reports (the discriminated-union switch), and every
// error writer must treat an empty list as the absence of an error.

const settle = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// The refinement throws for ONE value only. The sync entry points run the
// refinement once through zod's sync parse before they learn the scope is
// async, and zod discards that first promise, so a refinement that rejects
// on its very first run would leak zod's own unhandled rejection into the
// test run. Latching the scope on a benign value first mirrors what an app
// sees after its first keystroke; the rejection under test is then the
// library's to handle.
const exploding = z.object({
  username: z.string().refine(
    async (value) => {
      await settle(5);
      if (value === "boom") throw new Error("lookup failed");
      return true;
    },
    { message: "n/a" },
  ),
  email: z.string(),
});

const boomValues = { username: "boom", email: "ada@example.com" };

describe("a throwing async refinement releases the in-flight flags", () => {
  it("validateAsync rejects and isValidatingForm reads false afterwards", async () => {
    const form = createForm(exploding, { initialValues: boomValues });
    const pass = form.validateAsync();
    expect(form.getState().isValidatingForm).toBe(true);
    await expect(pass).rejects.toThrow("lookup failed");
    expect(form.getState().isValidatingForm).toBe(false);
  });

  it("validateFieldAsync rejects and the field's flag is released", async () => {
    const form = createForm(exploding, { initialValues: boomValues });
    const pass = form.validateFieldAsync("username");
    expect(form.getState().isValidating["username"]).toBe(true);
    await expect(pass).rejects.toThrow("lookup failed");
    expect(form.getState().isValidating).toEqual({});
  });

  it("validateFieldsAsync rejects and releases every flag it owns", async () => {
    const form = createForm(exploding, { initialValues: boomValues });
    const pass = form.validateFieldsAsync(["username", "email"]);
    expect(form.getState().isValidating).toEqual({
      username: true,
      email: true,
    });
    await expect(pass).rejects.toThrow("lookup failed");
    expect(form.getState().isValidating).toEqual({});
  });

  it("a superseded pass that rejects leaves the newer pass's flag alone", async () => {
    const form = createForm(exploding, { initialValues: boomValues });
    const first = form.validateFieldAsync("username");
    const second = form.validateFieldAsync("username");
    await expect(first).rejects.toThrow("lookup failed");
    expect(form.getState().isValidating["username"]).toBe(true);
    await expect(second).rejects.toThrow("lookup failed");
    expect(form.getState().isValidating).toEqual({});
  });

  it("the sync entry points hand back a promise that rejects, flags released", async () => {
    const form = createForm(exploding, {
      initialValues: { username: "ada", email: "ada@example.com" },
    });
    // Latch the scope on the benign value (see the schema's comment).
    const first = form.validateField("username");
    if (first.kind === "pending") await first.promise;
    form.setValue("username", "boom");
    const result = form.validateField("username");
    expect(result.kind).toBe("pending");
    if (result.kind === "pending") {
      await expect(result.promise).rejects.toThrow("lookup failed");
    }
    expect(form.getState().isValidating).toEqual({});
    const batch = form.validateFields(["username"]);
    expect(batch.kind).toBe("pending");
    if (batch.kind === "pending") {
      await expect(batch.promise).rejects.toThrow("lookup failed");
    }
    expect(form.getState().isValidating).toEqual({});
  });

  it("validateOnMount reports the rejection instead of leaving it unhandled", async () => {
    // The mount pass is the second run of the refinement (zod's sync parse
    // is the first, with the promise discarded), so a counter stands in for
    // the value-based trigger above.
    const runs = { count: 0 };
    const explodingOnMount = z.object({
      username: z.string().refine(
        async () => {
          // Read BEFORE the await: zod's discarded run and the mount pass
          // start back to back, so a read after it would see 2 for both.
          const run = (runs.count += 1);
          await settle(5);
          if (run > 1) throw new Error("lookup failed");
          return true;
        },
        { message: "n/a" },
      ),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const form = createForm(explodingOnMount, {
        initialValues: { username: "ada" },
        validateOnMount: true,
      });
      expect(form.getState().isValidatingForm).toBe(true);
      await settle(25);
      expect(form.getState().isValidatingForm).toBe(false);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("[formstand]"),
        expect.any(Error),
      );
    } finally {
      error.mockRestore();
    }
  });
});

const payment = z.object({
  payment: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("card"),
      cardNumber: z.string().min(1, "card number required"),
    }),
    z.object({
      method: z.literal("paypal"),
      email: z.string().min(1, "email required"),
    }),
  ]),
});

describe("a full-form parse on behalf of one field prunes stale errors", () => {
  it("switching the variant through the discriminant drops the old variant's errors", () => {
    const form = createForm(payment, {
      initialValues: { payment: { method: "card", cardNumber: "" } },
    });
    form.validate();
    expect(form.getState().errors).toEqual({
      "payment.cardNumber": ["card number required"],
    });
    // What the select's change validation does: a field-scoped pass on the
    // discriminant, which has to parse the whole form (the path sits under
    // a union). The old variant's error is stale; the new variant's missing
    // email is outside the scope and must NOT be surfaced by it.
    form.setValue("payment.method", "paypal");
    form.validateField("payment.method");
    expect(form.getState().errors).toEqual({});
    expect(form.getState().schemaErrors).toEqual({});
  });

  it("the async passes prune the same way", async () => {
    const form = createForm(payment, {
      initialValues: { payment: { method: "card", cardNumber: "" } },
    });
    await form.validateAsync();
    form.setValue("payment.method", "paypal");
    await form.validateFieldAsync("payment.method");
    expect(form.getState().errors).toEqual({});
    form.setValue("payment.method", "card");
    await form.validateAsync();
    expect(Object.keys(form.getState().errors)).toEqual(["payment.cardNumber"]);
    form.setValue("payment.method", "paypal");
    await form.validateFieldsAsync(["payment.method"]);
    expect(form.getState().errors).toEqual({});
  });

  const matching = z
    .object({ password: z.string(), confirm: z.string() })
    .refine((v) => v.password === v.confirm, {
      path: ["confirm"],
      message: "must match",
    });

  it("fixing the field a cross-field refine blamed clears the blame", () => {
    const form = createForm(matching, {
      initialValues: { password: "hunter2", confirm: "hunter3" },
    });
    form.validateField("confirm");
    expect(form.getState().errors).toEqual({ confirm: ["must match"] });
    form.setValue("password", "hunter3");
    form.validateField("password");
    expect(form.getState().errors).toEqual({});
  });

  it("never adds an error outside the scope", () => {
    const form = createForm(matching, {
      initialValues: { password: "hunter2", confirm: "hunter3" },
    });
    form.validateField("password");
    expect(form.getState().errors).toEqual({});
    form.validateFields(["password"]);
    expect(form.getState().errors).toEqual({});
  });

  it("a subschema pass prunes nothing (it judged only its slot)", () => {
    const form = createForm(
      z.object({ a: z.string().min(1, "a"), b: z.string().min(1, "b") }),
      { initialValues: { a: "", b: "" } },
    );
    form.validate();
    form.setValue("a", "x");
    form.validateField("a");
    expect(form.getState().errors).toEqual({ b: ["b"] });
  });
});

describe("every error writer drops an empty list", () => {
  const schema = z.object({ name: z.string(), age: z.number() });
  const make = () =>
    createForm(schema, { initialValues: { name: "Ada", age: 36 } });

  it("setErrors", () => {
    const form = make();
    form.setErrors({ name: [], age: ["too young"] });
    expect(form.getState().serverErrors).toEqual({ age: ["too young"] });
    expect(form.getState().errors).toEqual({ age: ["too young"] });
  });

  it("updateState channel patches", () => {
    const form = make();
    form.updateState(() => ({
      serverErrors: { name: [] },
      schemaErrors: { age: [] },
    }));
    expect(form.getState().serverErrors).toEqual({});
    expect(form.getState().schemaErrors).toEqual({});
    expect(form.getState().errors).toEqual({});
  });

  it("restore", () => {
    const form = make();
    form.restore({
      ...form.snapshot(),
      serverErrors: { name: [] },
      schemaErrors: { age: [] },
    });
    expect(form.getState().errors).toEqual({});
    expect(form.getState().serverErrors).toEqual({});
    expect(form.getState().schemaErrors).toEqual({});
  });
});

describe("a throwing onInvalid reaches onError", () => {
  it("resolves { kind: 'error' } and calls onError with the thrown value", async () => {
    const form = createForm(z.object({ name: z.string().min(1) }), {
      initialValues: { name: "" },
    });
    const onError = vi.fn();
    const result = await form.submit(
      () => {},
      () => {
        throw new Error("ui broke");
      },
      { onError },
    );
    expect(result.kind).toBe("error");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
