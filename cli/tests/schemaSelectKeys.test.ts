import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromJsonSchema } from "../src/fromJsonSchema";
import { openApiFixture } from "./helpers";

// `--schema constructor` used to resolve Object.prototype.constructor out
// of the component store (`candidate[select] !== undefined`) and generate a
// degraded form named "constructor" instead of saying no such schema
// exists. Lookups go through Object.hasOwn now, for bare names and for
// pointer segments alike.

describe("--schema and prototype keys", () => {
  const document: unknown = JSON.parse(fs.readFileSync(openApiFixture, "utf8"));

  it("constructor / toString / __proto__ are not schema names", () => {
    ["constructor", "toString", "__proto__"].forEach((select) => {
      expect(() =>
        fromJsonSchema(document, { source: "api.json", fallbackName: "X", select }),
      ).toThrowError(/no schema named/);
    });
  });

  it("a pointer segment naming a prototype member does not resolve", () => {
    expect(() =>
      fromJsonSchema(document, {
        source: "api.json",
        fallbackName: "X",
        select: "#/components/schemas/constructor",
      }),
    ).toThrowError(/does not resolve/);
  });
});
