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
