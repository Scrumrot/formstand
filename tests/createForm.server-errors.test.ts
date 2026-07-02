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
});
