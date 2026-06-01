import { describe, expect, it } from "vitest";
import {
  insertAt,
  moveFromTo,
  reKeyByArrayPath,
  removeAt,
  swapIndices,
} from "../src/core/array";

describe("removeAt mapper", () => {
  it("drops the removed index and shifts later ones down", () => {
    const m = removeAt(1);
    expect(m(0)).toBe(0);
    expect(m(1)).toBe(null);
    expect(m(2)).toBe(1);
    expect(m(3)).toBe(2);
  });
});

describe("insertAt mapper", () => {
  it("shifts indices at or after insertion point up", () => {
    const m = insertAt(1);
    expect(m(0)).toBe(0);
    expect(m(1)).toBe(2);
    expect(m(2)).toBe(3);
  });
});

describe("moveFromTo mapper", () => {
  it("maps from→to and shifts the slice between them (forward move)", () => {
    const m = moveFromTo(0, 2);
    expect(m(0)).toBe(2);
    expect(m(1)).toBe(0);
    expect(m(2)).toBe(1);
    expect(m(3)).toBe(3);
  });

  it("maps from→to and shifts the slice between them (backward move)", () => {
    const m = moveFromTo(2, 0);
    expect(m(0)).toBe(1);
    expect(m(1)).toBe(2);
    expect(m(2)).toBe(0);
    expect(m(3)).toBe(3);
  });
});

describe("swapIndices mapper", () => {
  it("swaps two indices and leaves others alone", () => {
    const m = swapIndices(1, 3);
    expect(m(0)).toBe(0);
    expect(m(1)).toBe(3);
    expect(m(2)).toBe(2);
    expect(m(3)).toBe(1);
  });
});

describe("reKeyByArrayPath", () => {
  const map = {
    "users.0.email": "a",
    "users.1.email": "b",
    "users.2.email": "c",
    "users.0.name": "an",
    other: "x",
  };

  it("leaves non-matching keys untouched", () => {
    const result = reKeyByArrayPath(map, "users", removeAt(0));
    expect(result["other"]).toBe("x");
  });

  it("drops entries at the removed index and shifts later ones down", () => {
    const result = reKeyByArrayPath(map, "users", removeAt(0));
    expect(result["users.0.email"]).toBe("b");
    expect(result["users.1.email"]).toBe("c");
    expect(result["users.2.email"]).toBeUndefined();
    expect(result["users.0.name"]).toBeUndefined();
  });

  it("inserts shift later entries up", () => {
    const result = reKeyByArrayPath(map, "users", insertAt(1));
    expect(result["users.0.email"]).toBe("a");
    expect(result["users.2.email"]).toBe("b");
    expect(result["users.3.email"]).toBe("c");
  });

  it("preserves the basePath key itself (array-level errors)", () => {
    const withRoot = { ...map, users: "array-level" };
    const result = reKeyByArrayPath(withRoot, "users", removeAt(0));
    expect(result["users"]).toBe("array-level");
  });

  it("ignores non-index segments under basePath", () => {
    const result = reKeyByArrayPath({ "users.length": "x" }, "users", removeAt(0));
    expect(result["users.length"]).toBe("x");
  });
});
