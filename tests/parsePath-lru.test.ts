import { describe, expect, it } from "vitest";
import { parsePath } from "../src/core/path";

// The parse cache is an LRU (cap 4096): a hit refreshes recency, an
// overflow evicts the oldest entry, so a hot path survives an app whose
// live path set exceeds the cap. Identity of the returned (frozen) array
// is the observable: a cache hit returns the same reference.

const CAP = 4096;

describe("parsePath LRU cache", () => {
  it("a recently hit path survives an overflow; the oldest cold one does not", () => {
    const hot = parsePath("lru.hot.0");
    const cold = parsePath("lru.cold.0");
    // Fill past the cap with fresh paths, touching the hot one along the
    // way so it stays recent while the cold one ages to the front.
    for (let i = 0; i < CAP; i += 1) {
      parsePath(`lru.fill.${i}`);
      if (i % 512 === 0) expect(parsePath("lru.hot.0")).toBe(hot);
    }
    expect(parsePath("lru.hot.0")).toBe(hot);
    expect(parsePath("lru.cold.0")).not.toBe(cold);
    expect(parsePath("lru.cold.0")).toEqual(["lru", "cold", 0]);
  });

  it("returns frozen, shared segments on a hit", () => {
    const a = parsePath("frozen.a.1");
    expect(parsePath("frozen.a.1")).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
  });
});
