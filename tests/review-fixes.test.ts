import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import { isFieldDirty, valuesEqual } from "../src/core/equality";
import { getAtPath, setAtPath, slotAtPath } from "../src/core/path";

// Regression tests for the 2026-07 full-repo review findings (library side).
// Each block names the defect it pins.

describe("valuesEqual key-set hole", () => {
  it("objects with equal key counts but different key sets are not equal", () => {
    // Before the fix: 1 === 1 and a.realname (undefined) matched the MISSING
    // b.realname, so b.nickname was never inspected.
    expect(valuesEqual({ realname: undefined }, { nickname: "Ann" })).toBe(
      false,
    );
    expect(valuesEqual({ nickname: "Ann" }, { realname: undefined })).toBe(
      false,
    );
  });

  it("still treats structurally identical objects as equal", () => {
    expect(valuesEqual({ a: undefined, b: 1 }, { a: undefined, b: 1 })).toBe(
      true,
    );
  });

  it("dirty tracking sees the dropped key", () => {
    expect(isFieldDirty({ realname: undefined }, { nickname: "Ann" })).toBe(
      true,
    );
  });
});

describe("path reads: own properties only", () => {
  it("does not leak Object.prototype members through record paths", () => {
    const values = { lookup: { real: "x" } };
    expect(getAtPath(values, "lookup.constructor")).toBeUndefined();
    expect(getAtPath(values, "lookup.toString")).toBeUndefined();
    expect(getAtPath(values, "lookup.real")).toBe("x");
  });

  it("slotAtPath resolves inherited keys to undefined values", () => {
    const slot = slotAtPath({ lookup: {} }, "lookup.constructor");
    // String segments may be legitimately absent — the slot exists but the
    // value must be undefined, not the inherited constructor Function.
    expect(slot.exists && slot.value === undefined).toBe(true);
  });
});

describe("path writes: non-plain objects are not spread apart", () => {
  it("refuses to write through a Date and leaves it unchanged", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const createdAt = new Date("2026-01-01");
    const values = { createdAt };
    const next = setAtPath(values, "createdAt.x", 1);
    expect(next.createdAt).toBe(createdAt);
    expect(next.createdAt instanceof Date).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("refuses to write through a Map and a class instance", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = new Map([["k", "v"]]);
    const withMap = setAtPath({ lookup: map }, "lookup.k", "w");
    expect(withMap.lookup).toBe(map);

    class User {
      name = "Ann";
    }
    const user = new User();
    const withUser = setAtPath({ user }, "user.name", "Bea");
    expect(withUser.user).toBe(user);
    expect(withUser.user instanceof User).toBe(true);
    warn.mockRestore();
  });

  it("still writes through plain nested objects", () => {
    const next = setAtPath({ a: { b: 1 } }, "a.b", 2);
    expect(next).toEqual({ a: { b: 2 } });
  });
});

describe("submit(): throwing onInvalid resolves as an error result", () => {
  it("never rejects out of handleSubmit", async () => {
    const form = createForm(z.object({ name: z.string().min(1) }), {
      initialValues: { name: "" },
    });
    const boom = new Error("onInvalid blew up");
    const result = await form.submit(
      () => {},
      () => {
        throw boom;
      },
    );
    expect(result).toEqual({ kind: "error", error: boom });
  });
});

describe("restore(): isSubmitting reflects live submits, not the snapshot", () => {
  it("a mid-submit snapshot restored later does not stick the flag", async () => {
    const form = createForm(z.object({ name: z.string() }), {
      initialValues: { name: "ok" },
    });
    const taken: ReturnType<typeof form.snapshot>[] = [];
    await form.submit(() => {
      taken.push(form.snapshot());
    });
    const snapDuring = taken[0];
    expect(snapDuring?.isSubmitting).toBe(true);
    expect(form.snapshot().isSubmitting).toBe(false);

    // All submits settled — restoring the mid-submit snapshot must not
    // resurrect the flag.
    if (snapDuring !== undefined) form.restore(snapDuring);
    expect(form.snapshot().isSubmitting).toBe(false);
  });
});
