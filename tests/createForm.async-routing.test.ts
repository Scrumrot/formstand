import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { isAsyncRequiredError } from "../src/core/validation";

const asyncSchema = z.object({
  username: z.string().refine(
    async (v) => {
      await new Promise((r) => setTimeout(r, 5));
      return v !== "taken";
    },
    { message: "taken" },
  ),
  name: z.string().min(2),
});

describe("sync validate() on an async schema", () => {
  it("returns a pending result instead of throwing, and the async pass writes errors", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", name: "Tim" },
    });
    const result = form.validate();
    expect(result.kind).toBe("pending");
    if (result.kind !== "pending") throw new Error();
    const settled = await result.promise;
    expect(settled.kind).toBe("invalid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("validateFields returns pending carrying the async pass's promise", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", name: "Tim" },
    });
    const result = form.validateFields(["username"]);
    expect(result.kind).toBe("pending");
    if (result.kind !== "pending") throw new Error();
    const settled = await result.promise;
    expect(settled.kind).toBe("invalid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("latches the async requirement: later sync calls skip the doomed parse", async () => {
    const syncRuns: string[] = [];
    const latchSchema = z.object({
      username: z
        .string()
        .refine((v) => {
          syncRuns.push(v);
          return true;
        })
        .refine(async (v) => v !== "taken", { message: "taken" }),
    });
    const form = createForm(latchSchema, {
      initialValues: { username: "ok" },
    });
    // First call pays one doomed sync parse (running the sync refine) before
    // routing async; the async parse runs the sync refine again.
    const first = form.validateField("username");
    expect(first.kind).toBe("pending");
    if (first.kind !== "pending") throw new Error();
    await first.promise;
    expect(syncRuns).toHaveLength(2);
    // Latched: the second call goes straight to the async pass — exactly one
    // more sync-refine execution (inside safeParseAsync), not two.
    const second = form.validateField("username");
    expect(second.kind).toBe("pending");
    if (second.kind !== "pending") throw new Error();
    await second.promise;
    expect(syncRuns).toHaveLength(3);
  });
});

describe("sync validateField on an async schema", () => {
  it("returns pending for the field carrying the async refine", async () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "taken", name: "Tim" },
    });
    const result = form.validateField("username");
    expect(result.kind).toBe("pending");
    if (result.kind !== "pending") throw new Error();
    const settled = await result.promise;
    expect(settled.kind).toBe("invalid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("settles synchronously for a sync field, even when the schema has async refines elsewhere", () => {
    const form = createForm(asyncSchema, {
      initialValues: { username: "ok", name: "x" },
    });
    const result = form.validateField("name");
    expect(result.kind).toBe("invalid");
    expect(form.getState().errors["name"]).toBeDefined();
  });
});

describe("isAsyncRequiredError", () => {
  it("matches zod's async-required error by class", () => {
    try {
      asyncSchema.safeParse({ username: "x", name: "Tim" });
      throw new Error("expected safeParse to throw");
    } catch (e) {
      expect(isAsyncRequiredError(e)).toBe(true);
    }
  });

  it("does not match unrelated errors", () => {
    expect(isAsyncRequiredError(new Error("boom"))).toBe(false);
    expect(isAsyncRequiredError(undefined)).toBe(false);
  });
});
