import { describe, expect, it } from "vitest";
import { leafPaths, unmatchedErrorKeys } from "../../src/devtools/paths";

describe("leafPaths", () => {
  it("walks nested objects and array rows to one path per leaf", () => {
    expect(
      leafPaths({
        name: "ada",
        address: { city: "London", zip: null },
        tags: ["a", "b"],
      }),
    ).toEqual([
      "name",
      "address.city",
      "address.zip",
      "tags.0",
      "tags.1",
    ]);
  });

  it("treats an empty container as a leaf rather than dropping it", () => {
    // A field that exists in the schema but holds [] or {} must still show
    // up; dropping it would hide the field the user is looking for.
    expect(leafPaths({ tags: [], meta: {} })).toEqual(["tags", "meta"]);
  });

  it("treats a Date as a leaf, not a container", () => {
    const paths = leafPaths({ born: new Date("2026-06-01T00:00:00Z") });
    expect(paths).toEqual(["born"]);
  });

  it("keeps rows addressable through arrays of objects", () => {
    expect(leafPaths({ users: [{ email: "a@b.c" }, { email: "d@e.f" }] })).toEqual([
      "users.0.email",
      "users.1.email",
    ]);
  });

  it("handles a null value without recursing into it", () => {
    expect(leafPaths({ maybe: null })).toEqual(["maybe"]);
  });
});

describe("unmatchedErrorKeys", () => {
  it("surfaces the root key and array-level keys the field table misses", () => {
    const leaves = ["users.0.email", "users.1.email"];
    expect(
      unmatchedErrorKeys(["", "users", "users.0.email"], leaves),
    ).toEqual(["", "users"]);
  });

  it("reports nothing when every error has a field", () => {
    expect(unmatchedErrorKeys(["a", "b"], ["a", "b", "c"])).toEqual([]);
  });
});
