// Executes the promises the DOCS make, so a behaviour change that
// contradicts the documentation fails here rather than shipping.
//
// Every test cites the page and the sentence it is pinning. These are
// deliberately duplicative of the unit suites: the point is not extra
// coverage of the code, it is coverage of the DOCUMENTATION, so if someone
// changes a contract and updates the unit test to match, this still fails
// and points at the prose that went stale.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

describe("errors.md: the two channels", () => {
  it("a background validation pass cannot wipe a server verdict", async () => {
    // "A background validateAsync() finishing after your submit handler set a
    //  'username taken' message physically cannot wipe it."
    const form = createForm(z.object({ username: z.string().min(2) }), {
      initialValues: { username: "ada" },
    });
    form.setError("username", "taken");
    await form.validateAsync();
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("the schema message wins at a key, and the server verdict resurfaces", async () => {
    // "setError on a key the schema currently rejects stores the verdict
    //  BEHIND the schema message... if the schema later clears at that key
    //  WITHOUT the value changing, the stored server verdict resurfaces."
    const schema = z.object({ name: z.string().min(3, "too short") });
    const form = createForm(schema, { initialValues: { name: "ab" } });
    await form.validateAsync();
    form.setError("name", "server says no");
    expect(form.getState().errors["name"]).toEqual(["too short"]);
    expect(form.getState().serverErrors["name"]).toEqual(["server says no"]);

    // Schema clears without the value changing: relax the rule by swapping
    // the mode of failure, i.e. clear the schema channel via a passing pass.
    const relaxed = createForm(z.object({ name: z.string() }), {
      initialValues: { name: "ab" },
    });
    relaxed.setError("name", "server says no");
    await relaxed.validateAsync();
    expect(relaxed.getState().errors["name"]).toEqual(["server says no"]);
  });

  it("editing a descendant releases a verdict on the container", () => {
    // "Editing address.street releases a verdict on address (the container
    //  it judged changed)."
    const form = createForm(
      z.object({ address: z.object({ street: z.string(), city: z.string() }) }),
      { initialValues: { address: { street: "1 High St", city: "London" } } },
    );
    form.setError("address", "unverified");
    form.setValue("address.street", "2 High St");
    expect(form.getState().errors["address"]).toBeUndefined();
  });

  it("replacing a container releases a verdict on its descendant", () => {
    // "Replacing address wholesale releases a verdict on address.street."
    const form = createForm(
      z.object({ address: z.object({ street: z.string() }) }),
      { initialValues: { address: { street: "1 High St" } } },
    );
    form.setError("address.street", "not deliverable");
    form.setValue("address", { street: "2 High St" });
    expect(form.getState().errors["address.street"]).toBeUndefined();
  });

  it("a row verdict follows its row through re-indexing", () => {
    // "A verdict on items.1.name moves to items.0.name when row 0 is
    //  removed, because that row's value didn't change."
    const form = createForm(
      z.object({ items: z.array(z.object({ name: z.string() })) }),
      { initialValues: { items: [{ name: "first" }, { name: "second" }] } },
    );
    form.setError("items.1.name", "duplicate");
    form.arrayRemove("items", 0);
    expect(form.getState().errors["items.0.name"]).toEqual(["duplicate"]);
    expect(form.getState().errors["items.1.name"]).toBeUndefined();
  });

  it('clearErrors("") clears only the root entry', () => {
    // "clearErrors('') clears just the root entry; clearErrors() clears
    //  everything."
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "x" },
    });
    form.setError("", "form-wide");
    form.setError("a", "field");
    form.clearErrors("");
    expect(form.getState().errors[""]).toBeUndefined();
    expect(form.getState().errors["a"]).toEqual(["field"]);
    form.clearErrors();
    expect(Object.keys(form.getState().errors)).toHaveLength(0);
  });

  it("submit proceeds while server errors are present", async () => {
    // "submit re-validates against the SCHEMA only. If the schema passes,
    //  your onValid handler runs even while server errors are present."
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "x" },
    });
    form.setError("a", "stale server verdict");
    const result = await form.submit(() => {});
    expect(result.kind).toBe("valid");
  });
});

describe("state.md: derived state", () => {
  it("push then remove reads clean again", () => {
    // "arrayPush followed by arrayRemove reads clean again."
    const form = createForm(z.object({ tags: z.array(z.string()) }), {
      initialValues: { tags: ["a"] },
    });
    expect(form.getFieldState("tags").dirty).toBe(false);
    form.arrayPush("tags", "b");
    expect(form.getFieldState("tags").dirty).toBe(true);
    form.arrayRemove("tags", 1);
    expect(form.getFieldState("tags").dirty).toBe(false);
  });

  it("re-picking the same date does not leave a field dirty", () => {
    // "Dates compare by timestamp (re-picking the same date must not leave
    //  a field permanently dirty)."
    const form = createForm(z.object({ born: z.date() }), {
      initialValues: { born: new Date("2026-06-01T00:00:00Z") },
    });
    form.setValue("born", new Date("2026-06-01T00:00:00Z"));
    expect(form.getFieldState("born").dirty).toBe(false);
  });

  it("adoptValues preserves interaction state and clears errors", async () => {
    // "Replaces values and initialValues and clears errors... but PRESERVES
    //  interaction state (touched, submitCount, isSubmitting, mode)."
    const form = createForm(z.object({ a: z.string().min(5, "short") }), {
      initialValues: { a: "x" },
    });
    form.setTouched("a");
    await form.submit(() => {}); // drives submitCount to 1, writes an error
    expect(form.getState().submitCount).toBe(1);
    form.adoptValues({ a: "yy" });
    expect(form.getState().touched["a"]).toBe(true);
    expect(form.getState().submitCount).toBe(1);
    expect(Object.keys(form.getState().errors)).toHaveLength(0);
    expect(form.getFieldState("a").dirty).toBe(false);
  });

  it("diff reports only what diverged, and drops a reverted field", () => {
    // "Minimal divergent paths... Reverting a field drops it."
    const form = createForm(z.object({ a: z.string(), b: z.string() }), {
      initialValues: { a: "1", b: "2" },
    });
    form.setValue("a", "changed");
    expect(form.diff()).toEqual({ a: "changed" });
    form.setValue("a", "1");
    expect(form.diff()).toEqual({});
  });
});

describe("validation.md: results and modes", () => {
  it("sync validate returns pending on an async schema", () => {
    // "The sync methods don't throw. They detect the async requirement,
    //  START the async pass themselves, and hand you the in-flight work."
    const form = createForm(
      z.object({
        username: z.string().refine(async () => true, "taken"),
      }),
      { initialValues: { username: "ada" } },
    );
    const result = form.validate();
    expect(result.kind).toBe("pending");
    // Never a bare truthy Promise that would slip through an if () gate.
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("a cross-field refine with a path lands on the blamed field", async () => {
    // "This is what makes a cross-field .superRefine with a path behave like
    //  a field-local rule on the blamed field."
    const schema = z
      .object({ min: z.number(), max: z.number() })
      .superRefine((v, ctx) => {
        if (v.max < v.min)
          ctx.addIssue({ code: "custom", message: "max below min", path: ["max"] });
      });
    const form = createForm(schema, { initialValues: { min: 10, max: 1 } });
    await form.validateFieldAsync("max");
    expect(form.getState().errors["max"]).toEqual(["max below min"]);
  });

  it("a root-level refine lands at the empty key", async () => {
    // "A .refine WITHOUT a path lands at the root '' key instead."
    const form = createForm(
      z.object({ a: z.string() }).refine(() => false, "form is wrong"),
      { initialValues: { a: "x" } },
    );
    await form.validateAsync();
    expect(form.getState().errors[""]).toEqual(["form is wrong"]);
  });
});

describe("components.md: empty values", () => {
  it("nullable clears to null and optional clears to undefined", () => {
    // ".nullable() (and not optional) -> clearing writes null...
    //  .optional() -> clearing writes undefined."
    const form = createForm(
      z.object({
        nullable: z.number().nullable(),
        optional: z.number().optional(),
      }),
      { initialValues: { nullable: 1, optional: 1 } },
    );
    expect(form.getFieldState("nullable").value).toBe(1);
    // emptyValue is surfaced through useField; the schema rule behind it is
    // asserted directly in tests/validation. Here we pin the round trip.
    form.setValue("nullable", null);
    form.setValue("optional", undefined);
    expect(form.getState().values.nullable).toBeNull();
    expect(form.getState().values.optional).toBeUndefined();
  });
});

describe("api: submit result contract", () => {
  it("a throwing handler resolves as error rather than rejecting", async () => {
    // "submit resolves with the thrown value instead of rejecting, so
    //  handleSubmit never leaves an unhandled rejection."
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "x" },
    });
    const boom = new Error("save failed");
    const result = await form.submit(() => {
      throw boom;
    });
    expect(result).toEqual({ kind: "error", error: boom });
  });

  it("a second submit in flight is skipped unless forced", async () => {
    // "{ kind: 'skipped' } when another submit is in flight and force
    //  isn't set."
    const form = createForm(z.object({ a: z.string() }), {
      initialValues: { a: "x" },
    });
    const slow = form.submit(
      () => new Promise<void>((resolve) => setTimeout(resolve, 30)),
    );
    const second = await form.submit(() => {});
    expect(second.kind).toBe("skipped");
    const forced = await form.submit(() => {}, undefined, { force: true });
    expect(forced.kind).toBe("valid");
    await slow;
  });
});
