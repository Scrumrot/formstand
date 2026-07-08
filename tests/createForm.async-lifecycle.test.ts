import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

// Races between in-flight async validation passes and lifecycle operations
// (array ops, reset, adoptValues, submit-time value changes). Each test
// reproduces a formerly stuck or stale-committing scenario.

const usernameSchema = z.object({
  username: z.string().min(2).refine(
    async (v) => {
      await new Promise((r) => setTimeout(r, 10));
      return v !== "taken";
    },
    { message: "taken" },
  ),
});

const itemsSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().refine(
        async (v) => {
          await new Promise((r) => setTimeout(r, 10));
          return v !== "taken";
        },
        { message: "taken" },
      ),
    }),
  ),
});

describe("array ops with an async field validation in flight", () => {
  it("arrayRemove drops in-flight isValidating flags instead of re-keying them", async () => {
    const form = createForm(itemsSchema, {
      initialValues: { items: [{ name: "a" }, { name: "b" }, { name: "c" }] },
    });
    const promise = form.validateFieldAsync("items.2.name");
    expect(form.getState().isValidating["items.2.name"]).toBe(true);

    // Re-keying would move the flag to "items.1.name", which the pass's
    // cleanup (keyed on the original path) could never clear.
    form.arrayRemove("items", 0);
    await promise;
    expect(form.getState().isValidating).toEqual({});
  });
});

describe("adoptValues with async validation in flight", () => {
  it("clears isValidating and isValidatingForm for disowned passes", async () => {
    const form = createForm(usernameSchema, {
      initialValues: { username: "taken" },
    });
    const fieldPass = form.validateFieldAsync("username");
    const formPass = form.validateAsync();
    expect(form.getState().isValidating["username"]).toBe(true);
    expect(form.getState().isValidatingForm).toBe(true);

    // adoptValues clears the sequence map, so neither pass owns its slot
    // anymore — the flags must be cleared here or they'd stick forever.
    form.adoptValues({ username: "fresh" });
    await Promise.all([fieldPass, formPass]);
    expect(form.getState().isValidating).toEqual({});
    expect(form.getState().isValidatingForm).toBe(false);
  });
});

describe("pass ownership across reset()", () => {
  it("a pre-reset pass can never collide with (and disown) a post-reset pass", async () => {
    // Manually gated refine so the test controls completion order.
    const gates: Array<() => void> = [];
    const gatedSchema = z.object({
      username: z.string().refine(async () => {
        await new Promise<void>((resolve) => {
          gates.push(resolve);
        });
        return true;
      }),
    });
    const form = createForm(gatedSchema, {
      initialValues: { username: "first" },
    });

    const first = form.validateFieldAsync("username");
    form.setValue("username", "edited");
    // reset() restores the SAME initialValues reference, so the first pass's
    // values-changed guard cannot save us — only token ownership can.
    form.reset();
    const second = form.validateFieldAsync("username");
    await vi.waitFor(() => {
      expect(gates).toHaveLength(2);
    });
    expect(form.getState().isValidating["username"]).toBe(true);

    // The pre-reset pass completes first. If tokens could ever repeat (as a
    // per-key counter restarting after reset would), the old pass could pass
    // the ownership check and clear the live pass's flag.
    gates[0]?.();
    await first;
    expect(form.getState().isValidating["username"]).toBe(true);

    gates[1]?.();
    await second;
    expect(form.getState().isValidating["username"]).toBeUndefined();
  });
});

describe("submit stale-commit guard", () => {
  const syncSchema = z.object({ name: z.string().min(2, "too short") });

  it("skips error and touched writes when reset() lands mid-validation", async () => {
    const form = createForm(syncSchema, { initialValues: { name: "x" } });
    const invalidCalls: unknown[] = [];
    const promise = form.submit(
      () => {},
      (errors) => {
        invalidCalls.push(errors);
      },
    );
    // Synchronous reset to valid values before the validation await resolves:
    // the verdict describes the old snapshot, so no state writes may land.
    form.reset({ name: "long enough" });

    const result = await promise;
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error();
    expect(result.errors["name"]).toEqual(["too short"]);
    expect(invalidCalls).toHaveLength(1);
    expect(form.getState().errors).toEqual({});
    expect(form.getState().touched).toEqual({});
  });

  it("still runs onValid and reports the snapshot verdict when values change mid-validation", async () => {
    const form = createForm(syncSchema, { initialValues: { name: "Tim" } });
    const seen: unknown[] = [];
    const promise = form.submit((data) => {
      seen.push(data);
    });
    form.setValue("name", "x");
    const result = await promise;
    expect(result.kind).toBe("valid");
    expect(seen).toEqual([{ name: "Tim" }]);
  });

  it("skips error and touched writes when a bare reset() lands mid-flight on a PRISTINE form", async () => {
    // Slow async refine on a sibling field keeps validation in flight while
    // the invalid `name` produces the verdict.
    const slowSchema = z.object({
      name: z.string().min(2, "too short"),
      username: z.string().refine(
        async () => {
          await new Promise((r) => setTimeout(r, 20));
          return true;
        },
        { message: "taken" },
      ),
    });
    const form = createForm(slowSchema, {
      initialValues: { name: "x", username: "ok" },
    });
    const invalidCalls: unknown[] = [];
    const promise = form.submit(
      () => {},
      (errors) => {
        invalidCalls.push(errors);
      },
    );
    // The form is pristine (values === initialValues), so a bare reset()
    // restores the SAME values reference — the values-changed guard cannot
    // catch this; only submit's ownership token (cleared by reset) can.
    form.reset();

    const result = await promise;
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error();
    expect(result.errors["name"]).toEqual(["too short"]);
    expect(invalidCalls).toHaveLength(1);
    expect(form.getState().errors).toEqual({});
    expect(form.getState().touched).toEqual({});
  });

  it("a concurrent submit({ force: true }) re-claims ownership — the LAST submit's state lands", async () => {
    // Manually gated refine whose verdict depends on call order: the first
    // pass (first submit) says invalid, later passes say valid — so the two
    // in-flight submits reach DIFFERENT verdicts over the same values.
    const gates: Array<() => void> = [];
    const gatedSchema = z.object({
      username: z.string().refine(
        async () => {
          const call = gates.length;
          await new Promise<void>((resolve) => {
            gates.push(resolve);
          });
          return call > 0;
        },
        { message: "taken" },
      ),
    });
    const form = createForm(gatedSchema, {
      initialValues: { username: "x" },
    });

    const first = form.submit(() => {});
    const second = form.submit(() => {}, undefined, { force: true });
    await vi.waitFor(() => {
      expect(gates).toHaveLength(2);
    });

    // The forced (last) submit settles first and commits its clean verdict.
    gates[1]?.();
    const secondResult = await second;
    expect(secondResult.kind).toBe("valid");
    expect(form.getState().errors).toEqual({});

    // The superseded first submit settles afterwards: it still reports its
    // snapshot's verdict, but its writes are skipped — the forced submit
    // re-claimed the ownership token, so stale errors/touched must not land
    // over the newer clean state.
    gates[0]?.();
    const firstResult = await first;
    expect(firstResult.kind).toBe("invalid");
    if (firstResult.kind !== "invalid") throw new Error();
    expect(firstResult.errors["username"]).toEqual(["taken"]);
    expect(form.getState().errors).toEqual({});
    expect(form.getState().touched).toEqual({});
  });
});

describe("validateFieldAsync('') routes through the form-level slot", () => {
  it("flags isValidatingForm (never isValidating['']) while in flight", async () => {
    const form = createForm(usernameSchema, {
      initialValues: { username: "taken" },
    });
    const promise = form.validateFieldAsync("");
    expect(form.getState().isValidatingForm).toBe(true);
    expect(form.getState().isValidating).toEqual({});

    const result = await promise;
    expect(result.kind).toBe("invalid");
    expect(form.getState().isValidatingForm).toBe(false);
    expect(form.getState().isValidating).toEqual({});
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("resolves valid when the whole form is valid", async () => {
    const form = createForm(usernameSchema, {
      initialValues: { username: "ok" },
    });
    const result = await form.validateFieldAsync("");
    expect(result.kind).toBe("valid");
    expect(form.getState().isValidatingForm).toBe(false);
  });
});
