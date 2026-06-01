import { describe, expect, it } from "vitest";
import { getAtPath, parsePath, setAtPath } from "../src/core/path";

describe("parsePath", () => {
  it("returns empty for empty string", () => {
    expect(parsePath("")).toEqual([]);
  });

  it("splits dotted strings", () => {
    expect(parsePath("a.b.c")).toEqual(["a", "b", "c"]);
  });

  it("converts numeric segments to numbers", () => {
    expect(parsePath("users.0.email")).toEqual(["users", 0, "email"]);
  });

  it("keeps leading-zero segments as strings", () => {
    expect(parsePath("a.01")).toEqual(["a", "01"]);
  });

  it("treats negative-looking strings as keys", () => {
    expect(parsePath("a.-1")).toEqual(["a", "-1"]);
  });
});

describe("getAtPath", () => {
  it("reads nested values", () => {
    expect(getAtPath({ a: { b: 1 } }, "a.b")).toBe(1);
  });

  it("reads array indices", () => {
    expect(getAtPath({ users: [{ email: "x" }] }, "users.0.email")).toBe("x");
  });

  it("returns undefined for missing intermediates", () => {
    expect(getAtPath({ a: {} }, "a.b.c")).toBeUndefined();
  });

  it("returns undefined when stepping through null", () => {
    expect(getAtPath({ a: null }, "a.b")).toBeUndefined();
  });

  it("returns the input for an empty path", () => {
    const obj = { a: 1 };
    expect(getAtPath(obj, "")).toBe(obj);
  });
});

describe("setAtPath", () => {
  it("sets a nested value without mutating the input", () => {
    const obj = { a: { b: 1 } };
    const next = setAtPath(obj, "a.b", 2);
    expect(next).toEqual({ a: { b: 2 } });
    expect(obj.a.b).toBe(1);
    expect(next).not.toBe(obj);
    expect(next.a).not.toBe(obj.a);
  });

  it("creates missing intermediate objects", () => {
    expect(setAtPath({}, "a.b.c", 1)).toEqual({ a: { b: { c: 1 } } });
  });

  it("sets an array index immutably", () => {
    const obj = { users: [{ email: "a" }, { email: "b" }] };
    const next = setAtPath(obj, "users.1.email", "c");
    expect(next.users[1]?.email).toBe("c");
    expect(next.users[0]).toBe(obj.users[0]);
    expect(obj.users[1]?.email).toBe("b");
  });

  it("fills array gaps with undefined when extending", () => {
    expect(setAtPath({ a: [] as unknown[] }, "a.2", "x")).toEqual({
      a: [undefined, undefined, "x"],
    });
  });

  it("replaces the entire value when given an empty path", () => {
    expect(setAtPath({ a: 1 }, "", { b: 2 })).toEqual({ b: 2 });
  });
});
