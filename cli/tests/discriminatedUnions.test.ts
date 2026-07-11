import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { moduleSpecifier } from "../src/cli";
import {
  type EmitFormOptions,
  emitInitialValues,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
  emitZodSchema,
} from "../src/codegen";
import { emitModuleForm } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import {
  fixturesDir,
  freshTmpDir,
  muiStubPaths,
  shadcnStubFile,
  typecheckDiagnostics,
} from "./helpers";
import { unionSchema } from "./fixtures/unionSchema";
import { unionCommonSchema } from "./fixtures/unionCommonSchema";
import { arrayUnionSchema } from "./fixtures/arrayUnionSchema";
import { unionOnlySchema } from "./fixtures/unionOnlySchema";

const req = { optional: false, nullable: false } as const;

describe("fromZod discriminated unions", () => {
  it("walks a discriminatedUnion into a union spec, dropping the discriminant", () => {
    const ir = fromZod(unionSchema);
    if (ir.kind !== "object") throw new Error("expected object root");
    const payment = ir.fields.find((f) => f.name === "payment");
    expect(payment?.spec).toEqual({
      kind: "union",
      discriminant: "method",
      ...req,
      variants: [
        {
          tag: "card",
          label: "Card",
          fields: [
            {
              name: "cardNumber",
              label: "Card Number",
              spec: { kind: "string", ...req },
            },
            {
              name: "installments",
              label: "Installments",
              spec: { kind: "number", ...req },
            },
          ],
        },
        {
          tag: "paypal",
          label: "Paypal",
          fields: [
            { name: "email", label: "Email", spec: { kind: "string", ...req } },
          ],
        },
        {
          tag: "invoice",
          label: "Invoice",
          fields: [
            {
              name: "terms",
              label: "Terms",
              spec: { kind: "enum", options: ["net30", "net60"], ...req },
            },
          ],
        },
      ],
    });
  });

  it("still reads a non-discriminated union of literals as an enum", () => {
    const ir = fromZod(
      z.object({ size: z.union([z.literal("s"), z.literal("m")]) }),
    );
    if (ir.kind !== "object") throw new Error("expected object root");
    expect(ir.fields[0]?.spec).toEqual({
      kind: "enum",
      options: ["s", "m"],
      ...req,
    });
  });

  it("falls back to string for a plain (non-literal) union", () => {
    const ir = fromZod(
      z.object({ mixed: z.union([z.string(), z.number()]) }),
    );
    if (ir.kind !== "object") throw new Error("expected object root");
    expect(ir.fields[0]?.spec.kind).toBe("string");
    expect(ir.fields[0]?.spec.todo).toContain("unions other than string");
  });
});

describe("discriminated union values + schema", () => {
  it("emitInitialValues selects variant 0 with the discriminant set", () => {
    const initial = emitInitialValues(fromZod(unionSchema), 0);
    expect(initial).toContain('method: "card"');
    expect(initial).toContain('cardNumber: ""');
    // No sibling variant fields leak into the blank draft.
    expect(initial).not.toContain("email:");
    expect(initial).not.toContain("terms:");
  });

  it("emitZodSchema round-trips the discriminatedUnion with its literals", () => {
    const source = emitZodSchema(fromZod(unionSchema), "unionSchema");
    expect(source).toContain('z.discriminatedUnion("method", [');
    expect(source).toContain('method: z.literal("card")');
    expect(source).toContain('method: z.literal("paypal")');
    expect(source).toContain('method: z.literal("invoice")');
  });
});

// THE ACCEPTANCE BAR: every backend + the module layout must emit a union
// that typechecks against the real useVariantField helper (the library
// source), so the generated useVariantField calls are proven type-correct.
const generateSingle = (
  emit: (options: EmitFormOptions) => string,
  dir: string,
): string => {
  const code = emit({
    ir: fromZod(unionSchema),
    formName: "PaymentForm",
    schemaImport: {
      name: "unionSchema",
      from: moduleSpecifier(dir, path.join(fixturesDir, "unionSchema.ts")),
      kind: "named",
    },
  });
  const file = path.join(dir, "PaymentForm.tsx");
  fs.writeFileSync(file, code, "utf8");
  return file;
};

const generateModule = (dir: string, ui: "plain" | "mui" | "shadcn") => {
  const files = emitModuleForm({
    ir: fromZod(unionSchema),
    formName: "PaymentForm",
    ui,
    schemaImport: {
      name: "unionSchema",
      from: moduleSpecifier(dir, path.join(fixturesDir, "unionSchema.ts")),
      kind: "named",
    },
  });
  return files.map((file) => {
    const dest = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    return dest;
  });
};

describe("discriminated union rendering typechecks", () => {
  it("plain single-file uses useVariantField and typechecks", () => {
    const dir = freshTmpDir("union-plain");
    const file = generateSingle(emitPlainForm, dir);
    const code = fs.readFileSync(file, "utf8");
    expect(code).toContain('useVariantField(form, "payment", "cardNumber")');
    expect(code).toContain('const paymentMethod = useField(form, "payment.method")');
    expect(code).toContain('paymentMethod.value === "card"');
    expect(typecheckDiagnostics([file])).toEqual([]);
  });

  it("mui single-file typechecks against the MUI stub", () => {
    const dir = freshTmpDir("union-mui");
    const file = generateSingle(emitMuiForm, dir);
    expect(typecheckDiagnostics([file], muiStubPaths)).toEqual([]);
  });

  it("shadcn single-file typechecks against the shadcn stub", () => {
    const dir = freshTmpDir("union-shadcn");
    const file = generateSingle(emitShadcnForm, dir);
    expect(typecheckDiagnostics([file, shadcnStubFile])).toEqual([]);
  });

  it("plain module emits a union section with the bound variant hook and typechecks", () => {
    const dir = freshTmpDir("union-module-plain");
    const written = generateModule(dir, "plain");
    const section = fs.readFileSync(
      path.join(dir, "sections", "PaymentSection.tsx"),
      "utf8",
    );
    expect(section).toContain(
      'usePaymentVariantField("payment", "cardNumber")',
    );
    expect(section).toContain('usePaymentField("payment.method")');
    expect(typecheckDiagnostics(written)).toEqual([]);
  });

  it("mui module union section typechecks against the MUI stub", () => {
    const dir = freshTmpDir("union-module-mui");
    const written = generateModule(dir, "mui");
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });

  it("shadcn module union section typechecks against the shadcn stub", () => {
    const dir = freshTmpDir("union-module-shadcn");
    const written = generateModule(dir, "shadcn");
    expect(typecheckDiagnostics([...written, shadcnStubFile])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Regression coverage for the three 0.9 union-emitter correctness bugs.
// Each proves the generated output TYPECHECKS against the real
// useVariantField/useField helpers (the emitter's own assumptions aren't
// enough — the existing fixture lacked these shapes, which is how the bugs
// slipped through).
// ---------------------------------------------------------------------------

type UnionSchema =
  | typeof unionCommonSchema
  | typeof arrayUnionSchema
  | typeof unionOnlySchema;

const emitSingleFor = (
  emit: (options: EmitFormOptions) => string,
  schema: UnionSchema,
  schemaName: string,
  fixture: string,
  dir: string,
): string => {
  const code = emit({
    ir: fromZod(schema),
    formName: "PaymentForm",
    schemaImport: {
      name: schemaName,
      from: moduleSpecifier(dir, path.join(fixturesDir, fixture)),
      kind: "named",
    },
  });
  const file = path.join(dir, "PaymentForm.tsx");
  fs.writeFileSync(file, code, "utf8");
  return file;
};

const emitModuleFor = (
  schema: UnionSchema,
  schemaName: string,
  fixture: string,
  ui: "plain" | "mui" | "shadcn",
  dir: string,
): readonly string[] => {
  const files = emitModuleForm({
    ir: fromZod(schema),
    formName: "PaymentForm",
    ui,
    schemaImport: {
      name: schemaName,
      from: moduleSpecifier(dir, path.join(fixturesDir, fixture)),
      kind: "named",
    },
  });
  return files.map((file) => {
    const dest = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    return dest;
  });
};

describe("bug C1: a field common to every variant binds with useField", () => {
  it("plain single-file binds the common field with useField, not useVariantField", () => {
    const dir = freshTmpDir("c1-plain");
    const file = emitSingleFor(
      emitPlainForm,
      unionCommonSchema,
      "unionCommonSchema",
      "unionCommonSchema.ts",
      dir,
    );
    const code = fs.readFileSync(file, "utf8");
    // `amount` is common → useField on the typed union path, rendered once.
    expect(code).toContain('useField(form, "payment.amount")');
    expect(code).not.toContain('useVariantField(form, "payment", "amount")');
    // The variant-only fields still route through useVariantField.
    expect(code).toContain('useVariantField(form, "payment", "cardNumber")');
    expect(code).toContain('useVariantField(form, "payment", "email")');
    expect(typecheckDiagnostics([file])).toEqual([]);
  });

  it("mui single-file typechecks", () => {
    const dir = freshTmpDir("c1-mui");
    const file = emitSingleFor(
      emitMuiForm,
      unionCommonSchema,
      "unionCommonSchema",
      "unionCommonSchema.ts",
      dir,
    );
    expect(typecheckDiagnostics([file], muiStubPaths)).toEqual([]);
  });

  it("shadcn single-file typechecks", () => {
    const dir = freshTmpDir("c1-shadcn");
    const file = emitSingleFor(
      emitShadcnForm,
      unionCommonSchema,
      "unionCommonSchema",
      "unionCommonSchema.ts",
      dir,
    );
    expect(typecheckDiagnostics([file, shadcnStubFile])).toEqual([]);
  });

  it("plain module binds the common field with the plain field hook", () => {
    const dir = freshTmpDir("c1-module-plain");
    const written = emitModuleFor(
      unionCommonSchema,
      "unionCommonSchema",
      "unionCommonSchema.ts",
      "plain",
      dir,
    );
    const section = fs.readFileSync(
      path.join(dir, "sections", "PaymentSection.tsx"),
      "utf8",
    );
    expect(section).toContain('usePaymentField("payment.amount")');
    expect(section).not.toContain(
      'usePaymentVariantField("payment", "amount")',
    );
    expect(section).toContain(
      'usePaymentVariantField("payment", "cardNumber")',
    );
    expect(typecheckDiagnostics(written)).toEqual([]);
  });

  it("mui module typechecks", () => {
    const dir = freshTmpDir("c1-module-mui");
    const written = emitModuleFor(
      unionCommonSchema,
      "unionCommonSchema",
      "unionCommonSchema.ts",
      "mui",
      dir,
    );
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });

  it("shadcn module typechecks", () => {
    const dir = freshTmpDir("c1-module-shadcn");
    const written = emitModuleFor(
      unionCommonSchema,
      "unionCommonSchema",
      "unionCommonSchema.ts",
      "shadcn",
      dir,
    );
    expect(typecheckDiagnostics([...written, shadcnStubFile])).toEqual([]);
  });
});

describe("bug C2: an array of discriminated unions (module layout)", () => {
  it("emits a TODO row, never textInputProps on the union field, and typechecks", () => {
    const dir = freshTmpDir("c2-module-plain");
    const written = emitModuleFor(
      arrayUnionSchema,
      "arrayUnionSchema",
      "arrayUnionSchema.ts",
      "plain",
      dir,
    );
    const section = fs.readFileSync(
      path.join(dir, "sections", "MethodsSection.tsx"),
      "utf8",
    );
    expect(section).toContain("array item is a union");
    expect(section).not.toContain("textInputProps");
    // No scalar row binding is emitted for the union item.
    expect(section).not.toContain("`methods.${index}`");
    // The row binds no field, so useXField must NOT be imported — an unused
    // import would break a consumer's noUnusedLocals (the C3-class bug).
    expect(section).not.toContain("useArrayUnionSchemaField,");
    expect(typecheckDiagnostics(written, {}, { noUnusedLocals: true })).toEqual(
      [],
    );
  });

  it("mui module typechecks", () => {
    const dir = freshTmpDir("c2-module-mui");
    const written = emitModuleFor(
      arrayUnionSchema,
      "arrayUnionSchema",
      "arrayUnionSchema.ts",
      "mui",
      dir,
    );
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });

  it("shadcn module typechecks", () => {
    const dir = freshTmpDir("c2-module-shadcn");
    const written = emitModuleFor(
      arrayUnionSchema,
      "arrayUnionSchema",
      "arrayUnionSchema.ts",
      "shadcn",
      dir,
    );
    expect(typecheckDiagnostics([...written, shadcnStubFile])).toEqual([]);
  });
});

describe("bug C3: a kind used only inside a union imports no leaf component", () => {
  it("plain single-file omits the unused leaf components and typechecks with noUnusedLocals", () => {
    const dir = freshTmpDir("c3-plain");
    const file = emitSingleFor(
      emitPlainForm,
      unionOnlySchema,
      "unionOnlySchema",
      "unionOnlySchema.ts",
      dir,
    );
    const code = fs.readFileSync(file, "utf8");
    // The single-variant union's only field is common → useField + raw
    // builders; the leaf COMPONENTS and useVariantField must be absent.
    expect(code).not.toContain("TextField");
    expect(code).not.toContain("SelectField");
    expect(code).not.toContain("useVariantField");
    expect(code).toContain('useField(form, "payment.cardNumber")');
    expect(code).toContain("textInputProps");
    // The strict harness ignores unused locals; a dedicated noUnusedLocals
    // pass is what actually proves no import is dead.
    expect(typecheckDiagnostics([file], {}, { noUnusedLocals: true })).toEqual(
      [],
    );
  });

  it("mui single-file typechecks", () => {
    const dir = freshTmpDir("c3-mui");
    const file = emitSingleFor(
      emitMuiForm,
      unionOnlySchema,
      "unionOnlySchema",
      "unionOnlySchema.ts",
      dir,
    );
    expect(typecheckDiagnostics([file], muiStubPaths)).toEqual([]);
  });

  it("shadcn single-file typechecks", () => {
    const dir = freshTmpDir("c3-shadcn");
    const file = emitSingleFor(
      emitShadcnForm,
      unionOnlySchema,
      "unionOnlySchema",
      "unionOnlySchema.ts",
      dir,
    );
    expect(typecheckDiagnostics([file, shadcnStubFile])).toEqual([]);
  });

  it("plain module typechecks", () => {
    const dir = freshTmpDir("c3-module-plain");
    const written = emitModuleFor(
      unionOnlySchema,
      "unionOnlySchema",
      "unionOnlySchema.ts",
      "plain",
      dir,
    );
    expect(typecheckDiagnostics(written)).toEqual([]);
  });

  it("mui module typechecks", () => {
    const dir = freshTmpDir("c3-module-mui");
    const written = emitModuleFor(
      unionOnlySchema,
      "unionOnlySchema",
      "unionOnlySchema.ts",
      "mui",
      dir,
    );
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });

  it("shadcn module typechecks", () => {
    const dir = freshTmpDir("c3-module-shadcn");
    const written = emitModuleFor(
      unionOnlySchema,
      "unionOnlySchema",
      "unionOnlySchema.ts",
      "shadcn",
      dir,
    );
    expect(typecheckDiagnostics([...written, shadcnStubFile])).toEqual([]);
  });
});
