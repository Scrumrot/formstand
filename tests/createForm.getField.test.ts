import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({
  name: z.string(),
  address: z.object({ city: z.string() }),
  users: z.array(z.object({ email: z.string() })),
});

describe("form.getField", () => {
  it("reads top-level value", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", address: { city: "NYC" }, users: [] },
    });
    const v = form.getField("name");
    expect(v).toBe("Tim");
    expectTypeOf(v).toEqualTypeOf<string>();
  });

  it("reads nested value", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", address: { city: "NYC" }, users: [] },
    });
    const v = form.getField("address.city");
    expect(v).toBe("NYC");
    expectTypeOf(v).toEqualTypeOf<string>();
  });

  it("reads through array indices", () => {
    const form = createForm(schema, {
      initialValues: {
        name: "Tim",
        address: { city: "NYC" },
        users: [{ email: "a@a.com" }],
      },
    });
    const v = form.getField("users.0.email");
    expect(v).toBe("a@a.com");
    expectTypeOf(v).toEqualTypeOf<string>();
  });

  it("rejects invalid paths at compile time", () => {
    const form = createForm(schema, {
      initialValues: { name: "Tim", address: { city: "NYC" }, users: [] },
    });
    // @ts-expect-error - "missing" is not a path
    form.getField("missing");
    expect(form).toBeDefined();
  });
});
