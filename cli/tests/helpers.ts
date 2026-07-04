import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FieldSpec } from "../src/ir";

export const testsDir = path.dirname(fileURLToPath(import.meta.url));
export const cliDir = path.resolve(testsDir, "..");
export const repoRoot = path.resolve(cliDir, "..");
export const fixturesDir = path.join(testsDir, "fixtures");

export const zodFixture = path.join(fixturesDir, "profileSchema.ts");
export const typeFixture = path.join(fixturesDir, "profileType.ts");

// A clean per-suite scratch directory under tests/.tmp (git- and
// eslint-ignored).
export const freshTmpDir = (name: string): string => {
  const dir = path.join(testsDir, ".tmp", name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// Enum option order is not guaranteed identical between the zod walk
// (declaration order) and the TS checker (which may reorder union members):
// sort options before comparing IRs across frontends.
export const normalizeIr = (spec: FieldSpec): FieldSpec => {
  switch (spec.kind) {
    case "enum":
      return { ...spec, options: [...spec.options].sort() };
    case "object":
      return {
        ...spec,
        fields: spec.fields.map((field) => ({
          ...field,
          spec: normalizeIr(field.spec),
        })),
      };
    case "array":
      return { ...spec, item: normalizeIr(spec.item) };
    default:
      return spec;
  }
};
