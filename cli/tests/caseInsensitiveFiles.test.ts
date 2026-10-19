import { describe, expect, it } from "vitest";
import { freshTmpDir, typecheckDiagnostics, writeModuleFiles } from "./helpers";
import { caseCollisionSchema } from "./fixtures/caseCollisionSchema";

// The module layout's planner deduped component names as exact strings, so
// `email` and `eMail` became EmailField.tsx and EMailField.tsx: distinct
// identifiers, one file on Windows and macOS (case-insensitive file
// systems), the second write clobbering the first. Names are now claimed
// case-insensitively.

describe("module file names dedupe case-insensitively", () => {
  const dir = freshTmpDir("case-insensitive-files");
  const { files, written } = writeModuleFiles(
    caseCollisionSchema,
    "caseCollisionSchema",
    "CaseForm",
    dir,
  );

  it("email/eMail, userID/userId, address/Address get distinct lowercase names", () => {
    const paths = files.map((file) => file.path);
    expect(paths).toContain("fields/EmailField.tsx");
    expect(paths).toContain("fields/EMailField2.tsx");
    expect(paths).toContain("fields/UserIDField.tsx");
    expect(paths).toContain("fields/UserIdField2.tsx");
    expect(paths).toContain("sections/AddressSection.tsx");
    expect(paths).toContain("sections/AddressSection2.tsx");
    const lower = paths.map((p) => p.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("the module compiles", () => {
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});
