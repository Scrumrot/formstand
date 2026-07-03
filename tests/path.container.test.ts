import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAtPath, setAtPath } from "../src/core/path";

describe("container-driven index-vs-key", () => {
  it("reads numeric string keys from records", () => {
    const record = { "0": "zero", "1": "one" };
    expect(getAtPath({ byId: record }, "byId.0")).toBe("zero");
    expect(getAtPath({ byId: record }, "byId.1")).toBe("one");
  });

  it("writes numeric keys into an existing record without arrayifying it", () => {
    const obj = { byId: { "0": "zero" } };
    const next = setAtPath(obj, "byId.1", "one");
    expect(next).toEqual({ byId: { "0": "zero", "1": "one" } });
    expect(Array.isArray((next as { byId: unknown }).byId)).toBe(false);
  });

  it("writes large numeric keys into an existing record (the index cap is array-only)", () => {
    const obj = { byId: { "4109238": "old" } };
    const next = setAtPath(obj, "byId.4109238", "new");
    expect(next).toEqual({ byId: { "4109238": "new" } });
  });

  it("still writes indices into existing arrays", () => {
    const next = setAtPath({ items: ["a", "b"] }, "items.1", "c");
    expect(next).toEqual({ items: ["a", "c"] });
  });

  it("creates an array for numeric segments when the container is absent", () => {
    expect(setAtPath({}, "items.0", "x")).toEqual({ items: ["x"] });
  });
});

describe("write guards", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a string key write into an array", () => {
    const obj = { items: ["a"] };
    const next = setAtPath(obj, "items.foo", "x");
    expect(next).toEqual({ items: ["a"] });
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("refuses huge array indices instead of allocating", () => {
    const obj = { items: ["a"] };
    const next = setAtPath(obj, "items.4294967296", "x");
    expect(next).toEqual({ items: ["a"] });
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
