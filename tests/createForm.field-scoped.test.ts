import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

describe("validateField prefix scope", () => {
  it("writes and clears errors for descendant paths of the target", () => {
    const schema = z.object({
      address: z.object({ city: z.string().min(1), zip: z.string().min(5) }),
    });
    const form = createForm(schema, {
      initialValues: { address: { city: "", zip: "1" } },
    });

    const result = form.validateField("address");
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors["address.city"]).toBeDefined();
    expect(form.getState().errors["address.zip"]).toBeDefined();

    form.setValue("address.city", "NYC");
    form.setValue("address.zip", "10001");
    expect(form.validateField("address").kind).toBe("valid");
    expect(form.getState().errors).toEqual({});
  });

  it("does not run async refines belonging to other fields", async () => {
    const calls = { username: 0 };
    const schema = z.object({
      username: z.string().refine(
        async (v) => {
          calls.username += 1;
          return v !== "taken";
        },
        { message: "taken" },
      ),
      name: z.string().min(2),
    });
    const form = createForm(schema, {
      initialValues: { username: "ok", name: "x" },
    });

    const result = await form.validateFieldAsync("name");
    expect(result.kind).toBe("invalid");
    expect(calls.username).toBe(0);
  });

  it("falls back to a full parse when a traversed level has refinements", () => {
    const schema = z
      .object({ password: z.string().min(8), confirm: z.string() })
      .refine((d) => d.password === d.confirm, {
        path: ["confirm"],
        message: "must match password",
      });
    const form = createForm(schema, {
      initialValues: { password: "longenough", confirm: "different" },
    });
    const result = form.validateField("confirm");
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors["confirm"]).toEqual(["must match password"]);
  });

  // Regression (2026-07 review #1): a field under an absent required
  // ancestor must not fabricate a "required" error in the fast path — the
  // full-form parse keys that at the ancestor (out of the field's scope),
  // so the field is valid/skipped. Sync and async must agree.
  it("skips a field whose required ancestor is undefined (sync == async)", async () => {
    const schema = z.object({ a: z.object({ b: z.string() }) });
    const blank = () =>
      createForm(schema, {
        initialValues: { a: undefined } as unknown as z.input<typeof schema>,
      });
    const syncForm = blank();
    const sync = syncForm.validateFields(["a.b"]);
    const syncBool = typeof sync === "boolean" ? sync : await sync;
    const asyncForm = blank();
    const asyncBool = await asyncForm.validateFieldsAsync(["a.b"]);
    expect(syncBool).toBe(true);
    expect(asyncBool).toBe(true);
    expect(syncForm.getState().errors["a.b"]).toBeUndefined();
    expect(asyncForm.getState().errors["a.b"]).toBeUndefined();
  });

  it("still validates a field when its ancestor is present", () => {
    const schema = z.object({ a: z.object({ b: z.string().min(1) }) });
    const form = createForm(schema, { initialValues: { a: { b: "" } } });
    expect(form.validateFields(["a.b"])).toBe(false);
    expect(form.getState().errors["a.b"]).toBeDefined();
    form.setValue("a.b", "ok");
    expect(form.validateFields(["a.b"])).toBe(true);
    expect(form.getState().errors["a.b"]).toBeUndefined();
  });
});
