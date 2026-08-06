import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { main, moduleSpecifier } from "../src/cli";
import { camelIdent, pascalCase } from "../src/casing";
import { emitPlainForm, emitZodSchema } from "../src/codegen";
import { emitAntdForm, emitMuiForm } from "../src/codegen";
import { emitModuleForm, joinModuleFiles } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import {
  antdStubPaths,
  freshTmpDir,
  mantineStubPaths,
  muiStubPaths,
  typecheckDiagnostics,
  zodFixture,
} from "./helpers";
import { tupleOnlySchema } from "./fixtures/tupleOnlySchema";
import fs from "node:fs";

// Regression tests for the 2026-07 full-repo review findings (CLI side).

const emitModule = (schema: unknown, formName: string) =>
  emitModuleForm({
    ir: fromZod(schema),
    formName,
    schemaImport: { name: "schema", from: "./external", kind: "named" },
    schemaSource: emitZodSchema(fromZod(schema), "schema"),
  });

describe("identifier safety", () => {
  it("digit-leading field names emit valid identifiers everywhere", () => {
    expect(pascalCase("2ndOwners")).toBe("_2ndOwners");
    const schema = z.object({ "2ndOwners": z.array(z.string()) });
    const single = emitPlainForm({
      ir: fromZod(schema),
      formName: "OwnersForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
    });
    expect(single).not.toMatch(/\b(const|type) 2/);
    expect(single).toContain("_2ndOwnersArray");

    const files = emitModule(schema, "OwnersForm");
    const paths = files.map((f) => f.path);
    expect(paths).toContain("sections/_2ndOwnersSection.tsx");
  });

  it("reserved-word row fields emit declarable const bindings", () => {
    expect(camelIdent("new")).toBe("new_");
    expect(camelIdent("delete")).toBe("delete_");
    const schema = z.object({
      items: z.array(z.object({ new: z.string(), delete: z.boolean() })),
    });
    const section = emitModule(schema, "ItemsForm").find((f) =>
      f.path.startsWith("sections/"),
    );
    expect(section?.content).not.toMatch(/\bconst (new|delete) =/);
    expect(section?.content).toContain("const new_ =");
    expect(section?.content).toContain("const delete_ =");
  });

  it("a field named after the module prefix does not collide with the bound hook", () => {
    const schema = z.object({ contact: z.string(), other: z.string() });
    const field = emitModule(schema, "ContactForm").find((f) =>
      f.path.startsWith("fields/Contact"),
    );
    // The per-field hook must NOT shadow useContactField from ../hooks.
    expect(field?.path).toBe("fields/ContactField2.tsx");
    expect(field?.content).toContain("export const useContactField2 = ()");
    expect(field?.content).toContain('import { useContactField } from "../hooks";');
  });

  it("__proto__ becomes a computed key so the field survives", () => {
    // The computed key here is the same trap the emitter fixes: a bare
    // `__proto__:` in THIS literal would silently vanish too.
    const source = emitZodSchema(
      fromZod(z.object({ ["__proto__"]: z.string() })),
      "s",
    );
    expect(source).toContain('["__proto__"]: z.string()');
  });
});

describe("emitted string literals", () => {
  it("escapes U+2028/U+2029 so generated files parse everywhere", () => {
    // JSON.stringify leaves these raw; inside a string literal they are
    // line terminators to pre-ES2019 parsers of the GENERATED file
    // (CodeQL js/bad-code-sanitization).
    const schema = z.object({ note: z.string() });
    const ir = fromZod(schema);
    const withSeparator = emitPlainForm({
      ir: {
        ...ir,
        kind: "object",
        fields: [
          {
            name: "note",
            label: `before after`,
            spec: { kind: "string", optional: false, nullable: false },
          },
        ],
      },
      formName: "NoteForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
    });
    expect(withSeparator).not.toContain(" ");
    expect(withSeparator).toContain("\\u2028");
  });
});

describe("boolean-only mui module adapter", () => {
  it("imports ChangeEvent (the Switch adapter uses it) and typechecks", () => {
    const schema = z.object({ isAdmin: z.boolean(), remote: z.boolean() });
    const files = emitModuleForm({
      ir: fromZod(schema),
      formName: "FlagsForm",
      ui: "mui",
      schemaImport: { name: "flagsSchema", from: "./schema", kind: "named" },
      schemaSource: emitZodSchema(fromZod(schema), "flagsSchema"),
    });
    const adapter = files.find((f) => f.path.startsWith("adapter."));
    expect(adapter?.content).toContain('import type { ChangeEvent } from "react";');

    const dir = freshTmpDir("review-bool-mui");
    const written = files.map((file) => {
      const dest = path.join(dir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });
});

describe("cli argument hardening", () => {
  it("rejects a non-identifier or reserved --name", async () => {
    expect(await main([zodFixture, "--name", "my-form"])).toBe(1);
    expect(await main([zodFixture, "--name", "my form"])).toBe(1);
    expect(await main([zodFixture, "--name", "delete"])).toBe(1);
    expect(await main([zodFixture, "--name", "ProfileForm"])).toBe(0);
  });

  it("moduleSpecifier fails loudly on cross-drive paths (win32)", () => {
    const run = () =>
      moduleSpecifier("C:\\proj\\src", "D:\\schemas\\profileSchema.ts");
    if (process.platform === "win32") {
      expect(run).toThrow(/different drives/);
    } else {
      // Non-Windows path.relative never returns an absolute here; just
      // assert same-dir behavior is unchanged.
      expect(moduleSpecifier("/a/b", "/a/b/schema.ts")).toBe("./schema");
    }
  });
});

describe("date fields are real bindings (0.9 cycle)", () => {
  it("no date TODO, no DATE_CAST, per-ui date builders", () => {
    const schema = z.object({ birthday: z.date().optional() });
    const plain = emitPlainForm({
      ir: fromZod(schema),
      formName: "BdayForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
    });
    expect(plain).toContain("<DateField");
    expect(plain).not.toContain("TODO: date input");

    const mui = emitMuiForm({
      ir: fromZod(schema),
      formName: "BdayForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
    });
    expect(mui).toContain("muiDateFieldProps");
    expect(mui).toContain("parseDateText");
    expect(mui).not.toContain("TODO: date input");

    const moduleOut = joinModuleFiles(
      emitModuleForm({
        ir: fromZod(schema),
        formName: "BdayForm",
        ui: "shadcn",
        schemaImport: { name: "s", from: "./schema", kind: "named" },
        schemaSource: emitZodSchema(fromZod(schema), "s"),
      }),
    );
    expect(moduleOut).toContain("shadcnDateInputProps");
    expect(moduleOut).not.toContain("as unknown as UseFieldReturn");
  });
});

describe("zod unwrapping", () => {
  it(".optional().nonoptional() is required again (checked annotation compiles)", () => {
    const schema = z.object({ name: z.string().optional().nonoptional() });
    const ir = fromZod(schema);
    const single = emitPlainForm({
      ir,
      formName: "NameForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
    });
    // Required string → blank is "" and the draft typechecks unchanged.
    expect(single).toContain('name: "",');
    expect(single).not.toContain("name: undefined");
  });
});

describe("single-file and module emitters agree on panel chrome", () => {
  it("mui --sections panel emits the same Card/CardContent/Typography shape", () => {
    const schema = z.object({
      shipping: z.object({ city: z.string() }),
    });
    const visual = { sections: "panel", columns: 2 } as const;
    const single = emitMuiForm({
      ir: fromZod(schema),
      formName: "ShipForm",
      schemaImport: { name: "s", from: "./s", kind: "named" },
      visual,
    });
    const moduleOut = joinModuleFiles(
      emitModuleForm({
        ir: fromZod(schema),
        formName: "ShipForm",
        ui: "mui",
        schemaImport: { name: "s", from: "./schema", kind: "named" },
        schemaSource: emitZodSchema(fromZod(schema), "s"),
        visual,
      }),
    );
    const chrome = [
      '<Card variant="outlined"',
      "<CardContent>",
      "<Grid container spacing={2}>",
      '<Typography variant="subtitle1"',
    ];
    chrome.forEach((piece) => {
      expect(single).toContain(piece);
      expect(moduleOut).toContain(piece);
    });
    expect(single).not.toContain("CardHeader");
    expect(moduleOut).not.toContain("CardHeader");
  });
});

describe("hoisted NumberProps consts respect the identifier registry (0.11 cycle)", () => {
  // A schema engineered so a real field's binding var lands exactly on the
  // DERIVED `${var}NumberProps` const the kit backends hoist next to a
  // number binding: without paired reservation, the generated file declares
  // the same const twice and fails tsc.
  const collisionSchema = z.object({
    items: z.array(
      z.object({ price: z.number(), priceNumberProps: z.string() }),
    ),
    payment: z.discriminatedUnion("method", [
      z.object({
        method: z.literal("card"),
        price: z.number(),
        priceNumberProps: z.string(),
      }),
      z.object({ method: z.literal("cash") }),
    ]),
  });

  it("single-file union hoists dodge a field named like the derived const", () => {
    const dir = freshTmpDir("review-numberprops-single");
    const schemaFile = path.join(dir, "schema.ts");
    fs.writeFileSync(
      schemaFile,
      emitZodSchema(fromZod(collisionSchema), "s"),
      "utf8",
    );
    const code = emitMuiForm({
      ir: fromZod(collisionSchema),
      formName: "CollisionForm",
      schemaImport: { name: "s", from: "./schema", kind: "named" },
    });
    const file = path.join(dir, "CollisionForm.tsx");
    fs.writeFileSync(file, code, "utf8");

    // The number binding reserved BOTH paymentPrice and the derived
    // paymentPriceNumberProps, so the sibling string field suffixes to
    // paymentPriceNumberProps2 instead of redeclaring the hoisted const.
    expect(code).toContain(
      "const paymentPriceNumberProps = useMuiNumberFieldProps(paymentPrice);",
    );
    expect(code).toContain("paymentPriceNumberProps2");
    expect(typecheckDiagnostics([file], muiStubPaths)).toEqual([]);
  });

  it("module rows and union sections dodge a field named like the derived const", () => {
    const files = emitModuleForm({
      ir: fromZod(collisionSchema),
      formName: "CollisionForm",
      ui: "mui",
      schemaImport: { name: "s", from: "./schema", kind: "named" },
      schemaSource: emitZodSchema(fromZod(collisionSchema), "s"),
    });

    const items = files.find((f) => f.path === "sections/ItemsSection.tsx");
    expect(items?.content).toContain(
      "const priceNumberProps = useMuiNumberFieldProps(price);",
    );
    expect(items?.content).toContain("priceNumberProps2");

    const dir = freshTmpDir("review-numberprops-module");
    const written = files.map((file) => {
      const dest = path.join(dir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });
});

// Regression tests for the 2026-08 container-migration review: root shapes
// whose section chrome outran the import/export gates. Each reproduced as a
// compile error in generated output while every suite was green, because the
// shared fixtures always carry an object or array field that satisfied the
// gates by accident. The version matrix covers these shapes against the real
// kit declarations (cli/matrix/edgeSchemas.ts); these tests keep the gates
// honest in CI, where the matrix does not run.
describe("container edge configs", () => {
  const writeModule = (
    files: readonly Readonly<{ path: string; content: string }>[],
    dir: string,
  ): readonly string[] =>
    files.map((file) => {
      const dest = path.join(dir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });

  it("a tuple-only root imports the section chrome it renders", () => {
    const dir = freshTmpDir("review-tuple-only-single");
    fs.writeFileSync(
      path.join(dir, "schema.ts"),
      emitZodSchema(fromZod(tupleOnlySchema), "s"),
      "utf8",
    );
    // columns 1 already needs the heading import (Typography/Title/Heading);
    // columns > 1 adds the kit grid pair (Row/Col, Grid). Both were missing.
    const flat = emitMuiForm({
      ir: fromZod(tupleOnlySchema),
      formName: "TupleFlatForm",
      schemaImport: { name: "s", from: "./schema", kind: "named" },
    });
    expect(flat).toContain("<Typography");
    const grid = emitAntdForm({
      ir: fromZod(tupleOnlySchema),
      formName: "TupleGridForm",
      schemaImport: { name: "s", from: "./schema", kind: "named" },
      visual: { sections: "flat", columns: 2 },
    });
    expect(grid).toContain("<Row gutter={[16, 16]}>");
    const flatFile = path.join(dir, "TupleFlatForm.tsx");
    const gridFile = path.join(dir, "TupleGridForm.tsx");
    fs.writeFileSync(flatFile, flat, "utf8");
    fs.writeFileSync(gridFile, grid, "utf8");
    expect(typecheckDiagnostics([flatFile], muiStubPaths)).toEqual([]);
    expect(typecheckDiagnostics([gridFile], antdStubPaths)).toEqual([]);
  });

  it("a module union section's imports match its forced 1-column shell", () => {
    const unionRootSchema = z.object({
      payment: z.discriminatedUnion("method", [
        z.object({ method: z.literal("card"), last4: z.string() }),
        z.object({ method: z.literal("bank"), iban: z.string() }),
      ]),
    });
    const files = emitModuleForm({
      ir: fromZod(unionRootSchema),
      formName: "PaymentForm",
      ui: "mantine",
      schemaImport: { name: "s", from: "./schema", kind: "named" },
      schemaSource: emitZodSchema(fromZod(unionRootSchema), "s"),
      visual: { sections: "flat", columns: 2 },
    });
    const section = files.find((f) => f.path === "sections/PaymentSection.tsx");
    // The union keeps its vertical shell at any column count (conditional
    // fragments cannot each be a grid cell), so the import block must be
    // computed from the SAME forced 1-column visual: Stack in, Grid out.
    expect(section?.content).toContain("<Stack");
    expect(section?.content).toMatch(
      /import \{[^}]*\bStack\b[^}]*\} from "@mantine\/core"/s,
    );
    expect(section?.content).not.toContain("<Grid");
    const written = writeModule(files, freshTmpDir("review-union-grid-module"));
    expect(typecheckDiagnostics(written, mantineStubPaths)).toEqual([]);
  });

  it("a module tuple-only root exports the field hook its sections import", () => {
    const files = emitModuleForm({
      ir: fromZod(tupleOnlySchema),
      formName: "TupleForm",
      ui: "plain",
      schemaImport: { name: "s", from: "./schema", kind: "named" },
      schemaSource: emitZodSchema(fromZod(tupleOnlySchema), "s"),
      visual: { sections: "flat", columns: 2 },
    });
    // The tuple sections bind scalar elements with useTupleField at their
    // positional paths, so hooks.ts must export it even though no plan
    // field, array, or union exists to trip the gate.
    const hooks = files.find((f) => f.path === "hooks.ts");
    expect(hooks?.content).toContain("useTupleField,");
    const written = writeModule(files, freshTmpDir("review-tuple-only-module"));
    expect(typecheckDiagnostics(written)).toEqual([]);
  });

  it("a module nested fieldset keeps its full-row span for CSS-grid uis", () => {
    const nestedSchema = z.object({
      shipping: z.object({
        note: z.string(),
        address: z.object({ street: z.string(), city: z.string() }),
      }),
    });
    // shadcn/plain have no cell wrapper to carry the span, so it must ride
    // the fieldset itself even inside the section grid — a bare nested
    // fieldset collapses into a single track.
    const sectionFor = (ui: "shadcn" | "plain") =>
      emitModuleForm({
        ir: fromZod(nestedSchema),
        formName: "ShippingForm",
        ui,
        schemaImport: { name: "s", from: "./schema", kind: "named" },
        schemaSource: emitZodSchema(fromZod(nestedSchema), "s"),
        visual: { sections: "flat", columns: 2 },
      }).find((f) => f.path === "sections/ShippingSection.tsx");
    expect(sectionFor("shadcn")?.content).toContain(
      '<fieldset className="md:col-span-full">',
    );
    expect(sectionFor("plain")?.content).toContain(
      '<fieldset style={{ gridColumn: "1 / -1" }}>',
    );
  });
});
