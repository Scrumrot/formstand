import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

// The devtools option wires zustand's middleware around the store; without
// the browser extension it must be inert — identical behavior, no throws.

const schema = z.object({ name: z.string().min(1) });

describe("createForm devtools option", () => {
  it("named connection behaves identically without the extension", () => {
    const form = createForm(schema, {
      initialValues: { name: "" },
      devtools: "checkout",
    });
    form.setValue("name", "Tim");
    expect(form.getState().values.name).toBe("Tim");
    expect(form.validate().kind).toBe("valid");
    form.reset();
    expect(form.getState().values.name).toBe("");
  });

  it("devtools: true and devtools: false both work", () => {
    const on = createForm(schema, {
      initialValues: { name: "a" },
      devtools: true,
    });
    const off = createForm(schema, {
      initialValues: { name: "a" },
      devtools: false,
    });
    on.setValue("name", "b");
    off.setValue("name", "b");
    expect(on.getState().values).toEqual(off.getState().values);
  });
});
