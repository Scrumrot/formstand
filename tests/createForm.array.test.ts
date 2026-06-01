import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  users: z
    .array(
      z.object({
        email: z.string().email(),
      }),
    )
    .min(1),
});

const makeForm = () =>
  createForm(schema, {
    initialValues: { users: [{ email: "a@a.com" }, { email: "b@b.com" }] },
  });

describe("array ops on values", () => {
  it("arrayPush appends to the end", () => {
    const form = makeForm();
    form.arrayPush("users", { email: "c@c.com" });
    expect(form.getState().values.users).toHaveLength(3);
    expect(form.getState().values.users[2]).toEqual({ email: "c@c.com" });
  });

  it("arrayRemove removes by index", () => {
    const form = makeForm();
    form.arrayRemove("users", 0);
    expect(form.getState().values.users).toEqual([{ email: "b@b.com" }]);
  });

  it("arrayInsert places item at the index", () => {
    const form = makeForm();
    form.arrayInsert("users", 1, { email: "x@x.com" });
    expect(form.getState().values.users.map((u) => u.email)).toEqual([
      "a@a.com",
      "x@x.com",
      "b@b.com",
    ]);
  });

  it("arrayMove moves an item to a new index (forward)", () => {
    const form = createForm(schema, {
      initialValues: {
        users: [
          { email: "0@x.com" },
          { email: "1@x.com" },
          { email: "2@x.com" },
        ],
      },
    });
    form.arrayMove("users", 0, 2);
    expect(form.getState().values.users.map((u) => u.email)).toEqual([
      "1@x.com",
      "2@x.com",
      "0@x.com",
    ]);
  });

  it("arraySwap swaps two indices", () => {
    const form = makeForm();
    form.arraySwap("users", 0, 1);
    expect(form.getState().values.users.map((u) => u.email)).toEqual([
      "b@b.com",
      "a@a.com",
    ]);
  });
});

describe("array ops re-key meta maps", () => {
  it("arrayRemove shifts touched/dirty/errors keys down", () => {
    const form = makeForm();
    form.setValue("users.0.email", "not-email");
    form.setValue("users.1.email", "still-not");
    form.setTouched("users.0.email", true);
    form.setTouched("users.1.email", true);
    form.validate();

    expect(form.getState().errors["users.0.email"]).toBeDefined();
    expect(form.getState().errors["users.1.email"]).toBeDefined();

    form.arrayRemove("users", 0);

    expect(form.getState().values.users).toHaveLength(1);
    expect(form.getState().errors["users.0.email"]).toBeDefined();
    expect(form.getState().errors["users.1.email"]).toBeUndefined();
    expect(form.getState().touched["users.0.email"]).toBe(true);
    expect(form.getState().touched["users.1.email"]).toBeUndefined();
    expect(form.getState().dirty["users.0.email"]).toBe(true);
    expect(form.getState().dirty["users.1.email"]).toBeUndefined();
  });

  it("arrayInsert shifts later meta keys up", () => {
    const form = makeForm();
    form.setTouched("users.0.email", true);
    form.setTouched("users.1.email", true);

    form.arrayInsert("users", 0, { email: "new@x.com" });

    expect(form.getState().touched["users.0.email"]).toBeUndefined();
    expect(form.getState().touched["users.1.email"]).toBe(true);
    expect(form.getState().touched["users.2.email"]).toBe(true);
  });

  it("arraySwap swaps meta keys", () => {
    const form = makeForm();
    form.setTouched("users.0.email", true);

    form.arraySwap("users", 0, 1);

    expect(form.getState().touched["users.0.email"]).toBeUndefined();
    expect(form.getState().touched["users.1.email"]).toBe(true);
  });

  it("arrayMove forward shifts the slice between from..to down", () => {
    const form = createForm(schema, {
      initialValues: {
        users: [
          { email: "0@x.com" },
          { email: "1@x.com" },
          { email: "2@x.com" },
        ],
      },
    });
    form.setTouched("users.0.email", true);
    form.setTouched("users.1.email", true);
    form.setTouched("users.2.email", true);

    form.arrayMove("users", 0, 2);

    expect(form.getState().touched["users.0.email"]).toBe(true);
    expect(form.getState().touched["users.1.email"]).toBe(true);
    expect(form.getState().touched["users.2.email"]).toBe(true);
  });

  it("preserves array-level errors (errors keyed on the path itself)", () => {
    const form = makeForm();
    form.setValues({ users: [] });
    form.validate();
    expect(form.getState().errors["users"]).toBeDefined();

    form.arrayPush("users", { email: "a@a.com" });
    expect(form.getState().errors["users"]).toBeDefined();
  });
});
