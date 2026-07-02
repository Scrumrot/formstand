import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";

const schema = z.object({ tags: z.array(z.string()) });

const makeForm = () =>
  createForm(schema, { initialValues: { tags: ["a", "b"] } });

describe("array op index validation", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("arrayRemove(-1) warns and leaves state untouched", () => {
    const form = makeForm();
    form.arrayRemove("tags", -1);
    expect(form.getState().values.tags).toEqual(["a", "b"]);
    expect(form.getState().dirty).toEqual({});
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("arrayRemove past the end warns and no-ops", () => {
    const form = makeForm();
    form.arrayRemove("tags", 2);
    expect(form.getState().values.tags).toEqual(["a", "b"]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("arrayMove with an out-of-range target no-ops", () => {
    const form = makeForm();
    form.arrayMove("tags", 0, 5);
    expect(form.getState().values.tags).toEqual(["a", "b"]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("arraySwap with a non-integer index no-ops", () => {
    const form = makeForm();
    form.arraySwap("tags", 0.5, 1);
    expect(form.getState().values.tags).toEqual(["a", "b"]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("arrayInsert at length appends", () => {
    const form = makeForm();
    form.arrayInsert("tags", 2, "c");
    expect(form.getState().values.tags).toEqual(["a", "b", "c"]);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
