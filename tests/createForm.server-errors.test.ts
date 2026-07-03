import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  username: z.string().min(1),
  name: z.string().min(2),
});

const makeForm = () =>
  createForm(schema, { initialValues: { username: "tim", name: "Tim" } });

describe("manual (server) errors vs validation passes", () => {
  it("a full-form validateAsync preserves a manual error the schema is silent on", async () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    const result = await form.validateAsync();
    expect(result.kind).toBe("valid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("sync validate() preserves manual errors too", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    expect(form.validate().kind).toBe("valid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("submit preserves manual errors and still calls onValid", async () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    const seen: unknown[] = [];
    await form.submit((data) => {
      seen.push(data);
    });
    expect(seen).toHaveLength(1);
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("a schema error at the same key supersedes the manual entry", () => {
    const form = createForm(schema, {
      initialValues: { username: "tim", name: "x" },
    });
    form.setError("name", ["server rejected"]);
    form.validate();
    const errors = form.getState().errors["name"];
    expect(errors).toBeDefined();
    expect(errors).not.toContain("server rejected");
  });

  it("editing the field releases its manual error at the next full pass", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    form.setValue("username", "tim2");
    form.validate();
    expect(form.getState().errors["username"]).toBeUndefined();
  });

  it("field-scoped validation targeting the path clears its manual error", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    const result = form.validateField("username");
    expect(result.kind).toBe("valid");
    expect(form.getState().errors["username"]).toBeUndefined();
  });

  it("field-scoped validation of another path leaves the manual error alone", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    form.validateField("name");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("clearErrors drops the manual mark, so nothing is resurrected later", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    form.clearErrors("username");
    form.validate();
    expect(form.getState().errors).toEqual({});
  });

  it("reset clears manual errors", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    form.reset();
    form.validate();
    expect(form.getState().errors).toEqual({});
  });

  it("restore brings manual marks back with the snapshot", async () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    const snap = form.snapshot();
    form.clearErrors();
    form.restore(snap);
    const result = await form.validateAsync();
    expect(result.kind).toBe("valid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("errors written through updateState survive validation like setError", () => {
    const form = makeForm();
    form.updateState((s) => ({
      errors: { ...s.errors, username: ["taken"] },
    }));
    expect(form.validate().kind).toBe("valid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("validateField('') is a full pass: manual errors are preserved", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    form.validateField("");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("clearErrors('') clears only the root entry, not field errors", () => {
    const form = makeForm();
    form.setError("", ["totals mismatch"]);
    form.setError("username", ["taken"]);
    form.clearErrors("");
    expect(form.getState().errors[""]).toBeUndefined();
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });
});

describe("manual errors on container paths", () => {
  const nestedSchema = z.object({
    address: z.object({ street: z.string().min(1), city: z.string().min(1) }),
  });

  const makeNestedForm = () =>
    createForm(nestedSchema, {
      initialValues: { address: { street: "Main", city: "Springfield" } },
    });

  it("editing a child field releases a manual error at the ancestor path", () => {
    const form = makeNestedForm();
    form.setError("address", ["invalid address"]);
    form.setValue("address.street", "Elm");
    form.validate();
    expect(form.getState().errors["address"]).toBeUndefined();
  });

  it("editing any field releases a root '' manual error", () => {
    const form = makeNestedForm();
    form.setError("", ["form rejected"]);
    form.setValue("address.city", "Shelbyville");
    form.validate();
    expect(form.getState().errors[""]).toBeUndefined();
  });
});

describe("manual errors across array operations", () => {
  const arraySchema = z.object({
    items: z.array(z.object({ name: z.string().min(1) })),
  });

  it("a row's manual error follows the row through remove and survives revalidation", async () => {
    const form = createForm(arraySchema, {
      initialValues: { items: [{ name: "a" }, { name: "b" }] },
    });
    form.setError("items.1.name", ["server rejected"]);
    form.arrayRemove("items", 0);
    expect(form.getState().errors["items.0.name"]).toEqual([
      "server rejected",
    ]);
    const result = await form.validateAsync();
    expect(result.kind).toBe("valid");
    expect(form.getState().errors["items.0.name"]).toEqual([
      "server rejected",
    ]);
  });

  it("a manual error on the array itself releases when the op changes the array", () => {
    const form = createForm(arraySchema, {
      initialValues: { items: [{ name: "a" }] },
    });
    form.setError("items", ["too many items"]);
    form.arrayRemove("items", 0);
    form.validate();
    expect(form.getState().errors["items"]).toBeUndefined();
  });
});
