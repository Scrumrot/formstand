import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emitMuiForm, emitPlainForm, emitZodSchema } from "../src/codegen";
import { emitModuleForm } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import { applyFieldOverrides, parseFieldOverrides } from "../src/overrides";
import {
  freshTmpDir,
  mantineStubPaths,
  muiStubPaths,
  typecheckDiagnostics,
} from "./helpers";

// The textarea override (config fields): same string binding, multi-line
// control — the dogfooding gap was a span: "full" cover letter rendered as
// a one-line input.

const schema = z.object({
  profile: z.object({
    headline: z.string(),
    bio: z.string().optional(),
  }),
});

const irWith = (
  overrides: Readonly<Record<string, unknown>>,
  columns: 1 | 2 | 3 = 1,
) =>
  applyFieldOverrides(
    fromZod(schema),
    parseFieldOverrides(overrides, "test"),
    "single",
    columns,
  );

describe("textarea override: config validation", () => {
  it("accepts component textarea on a string field", () => {
    const ir = irWith({ "profile.bio": { component: "textarea" } });
    if (ir.kind !== "object") throw new Error("expected object");
    const profile = ir.fields[0]?.spec;
    if (profile?.kind !== "object") throw new Error("expected object");
    expect(
      profile.fields.find((f) => f.name === "bio")?.spec.override?.component,
    ).toBe("textarea");
  });

  it("rejects optionsProp with textarea (nothing consumes options)", () => {
    expect(() =>
      parseFieldOverrides(
        { "profile.bio": { component: "textarea", optionsProp: true } },
        "test",
      ),
    ).toThrowError(/optionsProp requires component "autocomplete"/);
  });

  it("rejects textarea on non-string kinds", () => {
    const numberSchema = z.object({ count: z.number() });
    expect(() =>
      applyFieldOverrides(
        fromZod(numberSchema),
        parseFieldOverrides({ count: { component: "textarea" } }, "test"),
        "single",
        1,
      ),
    ).toThrowError(/component "textarea" applies to string fields only/);
  });
});

describe("textarea override: emission", () => {
  it("mui renders a multiline BoundTextareaField; plain an in-file TextareaField", () => {
    const ir = irWith({ "profile.bio": { component: "textarea" } });
    const mui = emitMuiForm({
      ir,
      formName: "ProfileForm",
      schemaImport: { name: "profileSchema", from: "./schema", kind: "named" },
    });
    expect(mui).toContain("const BoundTextareaField = ");
    expect(mui).toContain("multiline");
    expect(mui).toContain(
      '<BoundTextareaField form={form} path={"profile.bio"} label={"Bio"} />',
    );
    const plain = emitPlainForm({
      ir,
      formName: "ProfileForm",
      schemaImport: { name: "profileSchema", from: "./schema", kind: "named" },
    });
    expect(plain).toContain("const TextareaField = ");
    expect(plain).toContain("<textarea rows={3} {...textInputProps(field)} />");
  });

  it("composes with span: the widened cell wraps the textarea control", () => {
    const ir = irWith(
      { "profile.bio": { component: "textarea", span: "full" } },
      2,
    );
    const mui = emitMuiForm({
      ir,
      formName: "ProfileForm",
      schemaImport: { name: "profileSchema", from: "./schema", kind: "named" },
      visual: { sections: "flat", columns: 2 },
    });
    expect(mui).toMatch(
      /<Grid size=\{12\}>\s*<BoundTextareaField form=\{form\} path=\{"profile\.bio"\}/,
    );
  });

  it("single-file mui and module mantine textarea output typechecks", () => {
    const ir = irWith({ "profile.bio": { component: "textarea" } });
    const dir = freshTmpDir("textarea-typecheck");
    const schemaFile = path.join(dir, "profileSchema.ts");
    fs.writeFileSync(schemaFile, emitZodSchema(ir, "profileSchema"), "utf8");
    const out = path.join(dir, "ProfileForm.tsx");
    fs.writeFileSync(
      out,
      emitMuiForm({
        ir,
        formName: "ProfileForm",
        schemaImport: { name: "profileSchema", from: "./profileSchema", kind: "named" },
      }),
      "utf8",
    );
    expect(typecheckDiagnostics([schemaFile, out], muiStubPaths)).toEqual([]);

    const moduleDir = freshTmpDir("textarea-module");
    const files = emitModuleForm({
      ir,
      formName: "ProfileForm",
      ui: "mantine",
      schemaImport: { name: "profileSchema", from: "./s", kind: "named" },
      schemaSource: emitZodSchema(ir, "profileSchema"),
    });
    const field = files.find((f) => f.path === "fields/BioField.tsx");
    expect(field?.content).toContain("<Textarea rows={3} label={label}");
    const written = files.map((file) => {
      const dest = path.join(moduleDir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });
    expect(typecheckDiagnostics(written, mantineStubPaths)).toEqual([]);
  });
});
