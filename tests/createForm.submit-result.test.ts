import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string().min(2, "too short"),
  age: z.number().nonnegative(),
});

describe("submit result", () => {
  it("returns kind 'valid' with the parsed data", async () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    const result = await form.submit(() => {});
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error();
    expect(result.data).toEqual({ name: "Tim", age: 30 });
  });

  it("returns kind 'invalid' with the error map", async () => {
    const form = createForm(schema, {
      initialValues: { name: "x", age: -1 },
    });
    const result = await form.submit(() => {
      throw new Error("onValid must not run");
    });
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error();
    expect(result.errors["name"]).toEqual(["too short"]);
    expect(result.errors["age"]).toBeDefined();
  });

  it("marks every errored field touched on a failed submit", async () => {
    const form = createForm(schema, {
      initialValues: { name: "x", age: -1 },
    });
    expect(form.getState().touched).toEqual({});
    await form.submit(() => {});
    expect(form.getState().touched["name"]).toBe(true);
    expect(form.getState().touched["age"]).toBe(true);
  });

  it("returns kind 'error' with the thrown value when onValid throws", async () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    const boom = new Error("save failed");
    const result = await form.submit(() => {
      throw boom;
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error();
    expect(result.error).toBe(boom);
    expect(form.getState().isSubmitting).toBe(false);
  });

  it("writes no error state when an async onValid rejects", async () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    const result = await form.submit(async () => {
      throw new Error("network down");
    });
    expect(result.kind).toBe("error");
    expect(form.getState().errors).toEqual({});
    expect(form.getState().isSubmitting).toBe(false);
  });

  it("handleSubmit resolves kind 'error' (never rejects) when onValid throws", async () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", age: 30 },
    });
    const handler = form.handleSubmit(() =>
      Promise.reject(new Error("boom")),
    );
    // Invoked like an event handler: the returned promise must resolve —
    // a rejection here would surface as an unhandled rejection in the page.
    const result = await handler({ preventDefault: () => {} });
    expect(result.kind).toBe("error");
  });

  it("does not mark a phantom field for root-level refine errors", async () => {
    const rootSchema = z
      .object({ a: z.string(), b: z.string() })
      .refine((d) => d.a === d.b, { message: "must match" });
    const form = createForm(rootSchema, {
      initialValues: { a: "x", b: "y" },
    });
    const result = await form.submit(() => {});
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors[""]).toEqual(["must match"]);
    expect(form.getState().touched[""]).toBeUndefined();
  });
});
