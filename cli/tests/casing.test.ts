import { describe, expect, it } from "vitest";
import { singularize } from "../src/casing";

describe("singularize", () => {
  it("reverses the common plural spellings, last word only", () => {
    expect(singularize("References")).toBe("Reference");
    expect(singularize("Workshops")).toBe("Workshop");
    expect(singularize("Categories")).toBe("Category");
    expect(singularize("Addresses")).toBe("Address");
    expect(singularize("Boxes")).toBe("Box");
    expect(singularize("Batches")).toBe("Batch");
    expect(singularize("Job Openings")).toBe("Job Opening");
  });

  it("passes through what it cannot classify", () => {
    // Irregulars and short words survive unchanged: a plural surviving is
    // polish lost, a mangled singular would be a bug.
    expect(singularize("Children")).toBe("Children");
    expect(singularize("People")).toBe("People");
    expect(singularize("Status")).toBe("Status");
    expect(singularize("Tags")).toBe("Tag");
    expect(singularize("Bus")).toBe("Bus");
  });
});
