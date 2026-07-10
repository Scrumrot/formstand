import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { moduleSpecifier } from "../src/cli";
import { blankNeedsCast, emitPlainForm, emitZodSchema } from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { freshTmpDir, typecheckDiagnostics } from "./helpers";

// The kind × optional × nullable matrix behind emitInitialValues and
// blankNeedsCast — the one seam that ships as a compile error in USER code
// when the two functions drift. Pinned in both directions:
//   1. every no-cast combo lands in ONE schema whose generated (checked,
//      not cast) initialValues must typecheck, and
//   2. every cast combo is proven to genuinely NEED the cast — a checked
//      annotation with the blank value must FAIL to typecheck.

type Wrap = "plain" | "optional" | "nullable" | "optionalNullable";

const WRAPS: readonly Wrap[] = [
  "plain",
  "optional",
  "nullable",
  "optionalNullable",
];

const wrapSchema = (base: z.ZodType, wrap: Wrap): z.ZodType => {
  switch (wrap) {
    case "plain":
      return base;
    case "optional":
      return base.optional();
    case "nullable":
      return base.nullable();
    case "optionalNullable":
      return base.optional().nullable();
  }
};

const BASES: Readonly<Record<string, () => z.ZodType>> = {
  string: () => z.string(),
  number: () => z.number(),
  boolean: () => z.boolean(),
  date: () => z.date(),
  enum: () => z.enum(["a", "b"]),
};

const comboEntries = Object.entries(BASES).flatMap(([kind, base]) =>
  WRAPS.map((wrap) => ({
    kind,
    wrap,
    key: `${kind}_${wrap}`,
    schema: wrapSchema(base(), wrap),
  })),
);

describe("blank-value matrix", () => {
  const verdicts = comboEntries.map((combo) => ({
    ...combo,
    needsCast: blankNeedsCast(
      (fromZod(z.object({ [combo.key]: combo.schema })) as never as Readonly<{
        fields: readonly Readonly<{ spec: never }>[];
      }>).fields[0]!.spec,
    ),
  }));

  it("exactly the required number/date/enum combos need the cast", () => {
    const casts = verdicts.filter((v) => v.needsCast).map((v) => v.key);
    expect(casts.sort()).toEqual([
      "date_plain",
      "enum_plain",
      "number_plain",
    ]);
  });

  it("the no-cast combos produce ONE checked initialValues that typechecks", () => {
    const shape = Object.fromEntries(
      comboEntries
        .filter((c) => !verdicts.find((v) => v.key === c.key)?.needsCast)
        .map((c) => [c.key, c.schema]),
    );
    const schema = z.object(shape);
    const dir = freshTmpDir("blank-matrix");
    const schemaFile = path.join(dir, "matrixSchema.ts");
    fs.writeFileSync(schemaFile, emitZodSchema(fromZod(schema), "matrixSchema"), "utf8");
    const code = emitPlainForm({
      ir: fromZod(schema),
      formName: "MatrixForm",
      schemaImport: {
        name: "matrixSchema",
        from: moduleSpecifier(dir, schemaFile),
        kind: "named",
      },
    });
    expect(code).toContain("const initialValues: FormValues =");
    expect(code).not.toContain("as unknown as FormValues");
    const file = path.join(dir, "MatrixForm.tsx");
    fs.writeFileSync(file, code, "utf8");
    expect(typecheckDiagnostics([file])).toEqual([]);
  });

  it("each cast combo genuinely needs it: the blank fails the checked type", () => {
    const dir = freshTmpDir("blank-matrix-cast");
    const files = verdicts
      .filter((v) => v.needsCast)
      .map((v) => {
        // emitZodSchema already imports z, so z.input resolves cleanly —
        // the only legal diagnostic is the blank value failing the type.
        const source = [
          emitZodSchema(fromZod(z.object({ [v.key]: v.schema })), "s"),
          "",
          "// The blank draft with a CHECKED annotation must not compile —",
          "// this is what forces the as-unknown-as escape hatch.",
          `const blank: z.input<typeof s> = { ${v.key}: undefined };`,
          "void blank;",
          "",
        ].join("\n");
        const file = path.join(dir, `${v.key}.ts`);
        fs.writeFileSync(file, source, "utf8");
        return file;
      });
    files.forEach((file) => {
      const diagnostics = typecheckDiagnostics([file]);
      expect(
        diagnostics.length,
        `${path.basename(file)} should REJECT the blank draft`,
      ).toBeGreaterThan(0);
      // Guard against a vacuous pass: the failure must be the assignment,
      // not some unrelated syntax/import problem.
      expect(diagnostics.join(" ")).toMatch(/undefined|not assignable/i);
    });
  });
});
