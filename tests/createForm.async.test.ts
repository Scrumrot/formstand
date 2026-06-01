import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const usernameTakenSchema = z.object({
  username: z.string().min(2).refine(
    async (v) => {
      await new Promise((r) => setTimeout(r, 5));
      return v !== "taken";
    },
    { message: "username is taken" },
  ),
});

const simpleSchema = z.object({
  name: z.string().min(2),
  age: z.number().int().nonnegative(),
});

describe("form.validateAsync", () => {
  it("returns valid for good async input and writes empty errors", async () => {
    const form = createForm(usernameTakenSchema, {
      initialValues: { username: "ok" },
    });
    const result = await form.validateAsync();
    expect(result.kind).toBe("valid");
    expect(form.getState().errors).toEqual({});
  });

  it("returns invalid when an async refine rejects", async () => {
    const form = createForm(usernameTakenSchema, {
      initialValues: { username: "taken" },
    });
    const result = await form.validateAsync();
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors["username"]).toEqual(["username is taken"]);
  });

  it("sets isValidating while in flight and clears on resolve", async () => {
    const form = createForm(usernameTakenSchema, {
      initialValues: { username: "ok" },
    });
    const promise = form.validateAsync();
    expect(form.getState().isValidating["__form__"]).toBe(true);
    await promise;
    expect(form.getState().isValidating["__form__"]).toBeUndefined();
  });
});

describe("form.validateFieldAsync", () => {
  it("writes only the targeted field's errors", async () => {
    const form = createForm(usernameTakenSchema, {
      initialValues: { username: "taken" },
    });
    const result = await form.validateFieldAsync("username");
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors["username"]).toEqual(["username is taken"]);
  });

  it("toggles isValidating[path] around the await", async () => {
    const form = createForm(usernameTakenSchema, {
      initialValues: { username: "ok" },
    });
    const promise = form.validateFieldAsync("username");
    expect(form.getState().isValidating["username"]).toBe(true);
    await promise;
    expect(form.getState().isValidating["username"]).toBeUndefined();
  });

  it("ignores a stale resolution when a newer call is in flight", async () => {
    const form = createForm(usernameTakenSchema, {
      initialValues: { username: "taken" },
    });
    const first = form.validateFieldAsync("username");
    form.setValue("username", "ok");
    const second = form.validateFieldAsync("username");

    await first;
    await second;

    expect(form.getState().errors["username"]).toBeUndefined();
    expect(form.getState().isValidating["username"]).toBeUndefined();
  });

  it("clears the field's error when the latest call resolves to valid", async () => {
    const form = createForm(usernameTakenSchema, {
      initialValues: { username: "taken" },
    });
    await form.validateFieldAsync("username");
    expect(form.getState().errors["username"]).toBeDefined();

    form.setValue("username", "ok");
    await form.validateFieldAsync("username");
    expect(form.getState().errors["username"]).toBeUndefined();
  });
});

describe("form.submit with async schema", () => {
  it("calls onValid with parsed data when async refine passes", async () => {
    const form = createForm(usernameTakenSchema, {
      initialValues: { username: "ok" },
    });
    const seen: unknown[] = [];
    await form.submit((data) => {
      seen.push(data);
    });
    expect(seen).toEqual([{ username: "ok" }]);
  });

  it("calls onInvalid when async refine rejects", async () => {
    const form = createForm(usernameTakenSchema, {
      initialValues: { username: "taken" },
    });
    const invalidCalls: unknown[] = [];
    await form.submit(
      () => {},
      (errors) => {
        invalidCalls.push(errors);
      },
    );
    expect(invalidCalls).toHaveLength(1);
    expect(form.getState().errors["username"]).toEqual(["username is taken"]);
  });

  it("still works for sync-only schemas", async () => {
    const form = createForm(simpleSchema, {
      initialValues: { name: "Tim", age: 30 },
    });
    const seen: unknown[] = [];
    await form.submit((data) => {
      seen.push(data);
    });
    expect(seen).toEqual([{ name: "Tim", age: 30 }]);
  });
});
