import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const asyncSchema = z.object({
  username: z.string().min(2).refine(
    async (v) => {
      await new Promise((r) => setTimeout(r, 20));
      return v !== "taken";
    },
    { message: "taken" },
  ),
  email: z.string(),
});

describe("async validate stale-write guard", () => {
  it("validateFieldAsync drops result when values mutate during await", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", email: "t@t.com" },
    });
    const promise = form.validateFieldAsync("username");
    form.setValue("username", "ok");
    await promise;
    expect(form.getState().errors["username"]).toBeUndefined();
  });

  it("validateFieldAsync drops result when reset() runs during await", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", email: "t@t.com" },
    });
    const promise = form.validateFieldAsync("username");
    form.reset({ username: "ok", email: "t@t.com" });
    await promise;
    expect(form.getState().errors["username"]).toBeUndefined();
  });

  it("validateFieldAsync drops result when adoptValues runs during await", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", email: "t@t.com" },
    });
    const promise = form.validateFieldAsync("username");
    form.adoptValues({ username: "fresh", email: "t@t.com" });
    await promise;
    expect(form.getState().errors["username"]).toBeUndefined();
  });

  it("validateAsync (form-level) drops result when values mutate during await", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", email: "t@t.com" },
    });
    const promise = form.validateAsync();
    form.setValue("username", "ok");
    await promise;
    expect(form.getState().errors).toEqual({});
  });

  it("validateFieldsAsync clears isValidating and drops stale on values change", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", email: "t@t.com" },
    });
    const promise = form.validateFieldsAsync(["username", "email"]);
    expect(form.getState().isValidating["username"]).toBe(true);
    form.setValue("username", "ok");
    await promise;
    expect(form.getState().errors["username"]).toBeUndefined();
    expect(form.getState().isValidating["username"]).toBeUndefined();
  });
});

describe("submit result kinds", () => {
  it("returns kind 'valid' when submit ran on valid values", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "ok", email: "t@t.com" },
    });
    const result = await form.submit(() => {});
    expect(result.kind).toBe("valid");
  });

  it("returns kind 'skipped' when another submit is in flight", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "ok", email: "t@t.com" },
    });
    const first = form.submit(
      () => new Promise<void>((r) => setTimeout(r, 30)),
    );
    const second = form.submit(() => {});
    const [a, b] = await Promise.all([first, second]);
    expect(a.kind).toBe("valid");
    expect(b.kind).toBe("skipped");
  });
});

describe("submit guard decoupled from external setSubmitting", () => {
  it("setSubmitting(true) does not block submit", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "ok", email: "t@t.com" },
    });
    form.setSubmitting(true);
    expect(form.getState().isSubmitting).toBe(true);
    const result = await form.submit(() => {});
    expect(result.kind).toBe("valid");
  });
});
