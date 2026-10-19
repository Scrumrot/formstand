import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  freshTmpDir,
  muiStubPaths,
  typecheckDiagnostics,
  writeModuleFiles,
} from "./helpers";
import { degradedLeavesSchema } from "./fixtures/degradedLeavesSchema";
import { coerceSchema } from "./fixtures/coerceSchema";

// The module layout pinned a degraded leaf's binding in its FIELD FILE only.
// A degraded leaf inside an array row (an object row, a tuple row, a union
// row) or in a union section binds inline in the section file, where the
// hook inferred the real value type and the text builder refused it. Every
// inline binding site now carries the same pin, and the section file
// imports the type it names.

const PIN = "as unknown as UseFieldReturn<string | null | undefined>";

describe("module layout pins degraded leaves inside rows", () => {
  const dir = freshTmpDir("module-row-pins-plain");
  const degraded = writeModuleFiles(
    degradedLeavesSchema,
    "degradedLeavesSchema",
    "DegradedForm",
    path.join(dir, "degraded"),
  );
  const coerce = writeModuleFiles(
    coerceSchema,
    "coerceSchema",
    "CoerceForm",
    path.join(dir, "coerce"),
  );

  it("object rows, tuple rows, union rows, and union sections compile (plain)", () => {
    expect(typecheckDiagnostics([...degraded.written, ...coerce.written])).toEqual([]);
    const content = (name: string): string =>
      degraded.files.find((f) => f.path === name)?.content ?? "";
    expect(content("sections/RowsSection.tsx")).toContain(PIN);
    expect(content("sections/PairsSection.tsx")).toContain(PIN);
    expect(content("sections/EventsSection.tsx")).toContain(PIN);
    expect(content("sections/PaymentSection.tsx")).toContain(PIN);
    expect(content("sections/RowsSection.tsx")).toContain(
      'import type { UseFieldReturn } from "formstand";',
    );
    // Healthy bindings in the same files stay unpinned.
    expect(content("sections/RowsSection.tsx")).toContain(
      "const title = useDegradedField(`rows.${index}.title`);",
    );
    // A variant whose only field is degraded renders two nodes (the TODO
    // comment and the control), so it needs the fragment.
    expect(content("sections/EventsSection.tsx")).toContain(
      '{kind.value === "note" && (\n        <>\n          {/* TODO: unsupported zod type "record"',
    );
  });

  it("the same fixture compiles under a kit (mui)", () => {
    const kitDir = freshTmpDir("module-row-pins-mui");
    const kit = writeModuleFiles(
      degradedLeavesSchema,
      "degradedLeavesSchema",
      "DegradedForm",
      kitDir,
      "mui",
    );
    expect(typecheckDiagnostics(kit.written, muiStubPaths)).toEqual([]);
  });
});
