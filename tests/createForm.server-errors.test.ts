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

  it("schema and server errors coexist at different keys, each in its channel", () => {
    const form = createForm(schema, {
      initialValues: { username: "tim", name: "x" }, // name too short
    });
    form.setError("username", ["taken"]);
    form.validate();
    expect(form.getState().errors["username"]).toEqual(["taken"]);
    expect(form.getState().errors["name"]).toBeDefined();
    expect(form.getState().schemaErrors["username"]).toBeUndefined();
    expect(form.getState().serverErrors["username"]).toEqual(["taken"]);
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

  it("restore brings server errors back with the snapshot", async () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    const snap = form.snapshot();
    form.clearErrors();
    form.restore(snap);
    const result = await form.validateAsync();
    expect(result.kind).toBe("valid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("restore re-derives errors so an inconsistent snapshot can't install phantoms", () => {
    const form = makeForm();
    const snap = form.snapshot();
    // Hand-built snapshot whose merged map disagrees with its channels
    // (e.g. persisted under an older shape, or edited in devtools).
    form.restore({ ...snap, errors: { username: ["phantom"] } });
    expect(form.getState().errors).toEqual({});
    // And a channel-less legacy shape must not crash the next write.
    const legacy = Object.fromEntries(
      Object.entries(snap).filter(
        ([k]) => k !== "schemaErrors" && k !== "serverErrors",
      ),
    );
    form.restore(legacy as never);
    form.setValue("username", "tim2");
    expect(form.getState().errors).toEqual({});
  });

  it("server errors written through updateState survive validation like setError", () => {
    const form = makeForm();
    form.updateState((s) => ({
      serverErrors: { ...s.serverErrors, username: ["taken"] },
    }));
    expect(form.validate().kind).toBe("valid");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("the schema message wins at a shared key regardless of write order", () => {
    const form = createForm(schema, {
      initialValues: { username: "tim", name: "x" }, // name too short
    });
    form.validate();
    const schemaMessage = form.getState().errors["name"];
    form.setError("name", ["server rejected"]);
    // The merge is order-independent: the verdict is stored, the schema
    // message stays visible.
    expect(form.getState().errors["name"]).toBe(schemaMessage);
    expect(form.getState().serverErrors["name"]).toEqual(["server rejected"]);
  });

  it("a masked server verdict resurfaces when the schema clears without the field changing", () => {
    const refineSchema = z
      .object({ password: z.string(), confirm: z.string() })
      .refine((v) => v.password === v.confirm, {
        message: "passwords do not match",
        path: ["confirm"],
      });
    const form = createForm(refineSchema, {
      initialValues: { password: "a", confirm: "b" },
    });
    form.validate(); // schema error at confirm
    form.setError("confirm", ["code rejected"]); // masked by the schema message
    expect(form.getState().errors["confirm"]).toEqual([
      "passwords do not match",
    ]);
    // Fixing password clears the refine; confirm's own value never changed,
    // so the stored server verdict about it is still valid and resurfaces.
    form.setValue("password", "b");
    form.validate();
    expect(form.getState().errors["confirm"]).toEqual(["code rejected"]);
  });

  it("setValues releases only the verdicts whose value slice changed", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    form.setError("name", ["bad name"]);
    form.setValues({ username: "tim", name: "Timothy" }); // username unchanged
    expect(form.getState().errors["username"]).toEqual(["taken"]);
    expect(form.getState().errors["name"]).toBeUndefined();
  });

  it("validateField('') is a full pass: manual errors are preserved", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    form.validateField("");
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });

  it("validateFields(['']) delegates to the full pass too", () => {
    const form = makeForm();
    form.setError("username", ["taken"]);
    // "" is only reachable past the FieldPath type (runtime-built lists).
    expect(form.validateFields(["" as never])).toBe(true);
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

  it("resetField on a child releases the ancestor mark like setValue", () => {
    const form = makeNestedForm();
    form.setValue("address.street", "Elm");
    form.setError("address", ["invalid address"]);
    form.resetField("address.street");
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
