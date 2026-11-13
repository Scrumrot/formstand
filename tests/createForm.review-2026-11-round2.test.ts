import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

// Regression pins for the second November 2026 review, core half: the
// stale prune map in a mixed async batch, validateOnMount judging every
// baseline the form takes, restore() disowning in-flight passes, and the
// previous snapshot handed to watchField listeners.

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("validateFieldsAsync prunes only with a fresh full map", () => {
  // A path into a union cannot extract a subschema, so it sends the batch
  // through the full parse; an index into an empty array is a skip scope,
  // which reads as fresh after any unrelated change.
  const schema = z.object({
    email: z.string().email("bad email"),
    pay: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("card"), number: z.string().min(1, "req") }),
      z.object({ kind: z.literal("cash") }),
    ]),
    items: z.array(z.object({ name: z.string() })),
  });

  it("keeps an error committed elsewhere while the batch was in flight", async () => {
    const form = createForm(schema, {
      initialValues: {
        email: "tim@example.com",
        pay: { kind: "card", number: "4111" },
        items: [],
      },
    });
    const batch = form.validateFieldsAsync(["pay.number", "items.0"] as never);
    // The email breaks and is judged while the batch is still awaiting
    // its (now stale) full parse.
    form.setValue("email", "nope");
    form.validateField("email");
    expect(form.getState().errors.email).toEqual(["bad email"]);
    await batch;
    expect(form.getState().errors.email).toEqual(["bad email"]);
    expect(form.getState().isValidating).toEqual({});
  });
});

describe("validateOnMount judges every baseline", () => {
  const schema = z.object({ name: z.string().min(1, "required") });

  it("re-validates after adoptValues", () => {
    const form = createForm(schema, {
      initialValues: { name: "ok" },
      validateOnMount: true,
    });
    expect(form.getState().errors).toEqual({});
    form.adoptValues({ name: "" });
    expect(form.getState().errors.name).toEqual(["required"]);
    expect(form.getState().initialValues).toEqual({ name: "" });
  });

  it("re-validates after reset(), unless keepErrors asks for the map as it was", () => {
    const form = createForm(schema, {
      initialValues: { name: "" },
      validateOnMount: true,
    });
    expect(form.getState().errors.name).toEqual(["required"]);
    form.setValue("name", "ok");
    form.validateField("name");
    expect(form.getState().errors).toEqual({});
    form.reset();
    expect(form.getState().errors.name).toEqual(["required"]);
    form.setValue("name", "ok");
    form.validateField("name");
    form.reset(undefined, { keepErrors: true });
    expect(form.getState().errors).toEqual({});
  });

  it("runs the async pass in the background after adoptValues", async () => {
    const asyncSchema = z.object({
      name: z.string().refine(async (v) => v.length > 0, "required"),
    });
    const form = createForm(asyncSchema, {
      initialValues: { name: "ok" },
      validateOnMount: true,
    });
    await flush();
    expect(form.getState().errors).toEqual({});
    form.adoptValues({ name: "" });
    expect(form.getState().isValidatingForm).toBe(true);
    await flush();
    expect(form.getState().errors.name).toEqual(["required"]);
    expect(form.getState().isValidatingForm).toBe(false);
  });

  it("leaves a form without the option validation-silent", () => {
    const form = createForm(schema, { initialValues: { name: "ok" } });
    form.adoptValues({ name: "" });
    form.reset();
    expect(form.getState().errors).toEqual({});
  });
});

describe("restore() disowns in-flight passes", () => {
  it("does not let a pass started before the restore commit onto it", async () => {
    const schema = z.object({
      name: z.string().refine(async (v) => v.length > 0, "required"),
    });
    const form = createForm(schema, { initialValues: { name: "" } });
    // Same slot value in the snapshot, so the per-slot freshness check
    // alone would have let the verdict land.
    const snapshot = form.snapshot();
    const pass = form.validateFieldAsync("name");
    form.restore(snapshot);
    await pass;
    expect(form.getState().errors).toEqual({});
    expect(form.getState().isValidating).toEqual({});
  });
});

describe("watchField hands the previous snapshot to the listener", () => {
  it("passes (next, previous)", () => {
    const schema = z.object({ name: z.string() });
    const form = createForm(schema, { initialValues: { name: "a" } });
    const listener = vi.fn();
    form.watchField("name", listener);
    form.setValue("name", "b");
    expect(listener).toHaveBeenCalledTimes(1);
    const [next, previous] = listener.mock.calls[0] as [
      { value: string; dirty: boolean },
      { value: string; dirty: boolean },
    ];
    expect(next.value).toBe("b");
    expect(next.dirty).toBe(true);
    expect(previous.value).toBe("a");
    expect(previous.dirty).toBe(false);
  });
});
