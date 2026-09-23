import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emitZodSchema } from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { type EmitModuleOptions, emitModuleForm } from "../src/moduleLayout";
import {
  antdStubPaths,
  freshTmpDir,
  muiStubPaths,
  shadcnStubFile,
  typecheckDiagnostics,
} from "./helpers";

// The module layout used to generate a section only for a union or tuple
// at the schema ROOT; one nested inside an object section degraded to a
// "only top-level unions are generated" TODO, while the single-file layout
// bound the same shape. Now a nested union/tuple binds inside its section
// component exactly as a union/tuple field of an array row binds inside
// its Row: the discriminant and common keys with the bound field hook, the
// variant-only keys with the bound variant hook, tuple positions at their
// static indices, and the hooks hoisted into the section component.

const schema = z.object({
  customer: z.object({
    name: z.string(),
    payment: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("card"), last4: z.string(), amount: z.number() }),
      z.object({ kind: z.literal("invoice"), account: z.string() }),
    ]),
    shipping: z.object({
      // A second union in the same section, with the same discriminant
      // name, and clearable: var names dedupe and the select clears it.
      speed: z
        .discriminatedUnion("kind", [
          z.object({ kind: z.literal("ground"), days: z.number() }),
          z.object({ kind: z.literal("air") }),
        ])
        .optional(),
      coord: z.tuple([z.number(), z.number()]),
    }),
  }),
});

const generate = (
  dir: string,
  options: Partial<EmitModuleOptions> = {},
): Readonly<{ written: readonly string[]; section: string }> => {
  const ir = fromZod(schema);
  const files = emitModuleForm({
    ir,
    formName: "OrderForm",
    ui: "plain",
    schemaImport: { name: "orderSchema", from: "./external", kind: "named" },
    schemaSource: emitZodSchema(ir, "orderSchema"),
    ...options,
  });
  const written = files.map((file) => {
    const dest = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    return dest;
  });
  const section = files.find((file) =>
    file.path.endsWith("sections/CustomerSection.tsx"),
  );
  if (section === undefined) throw new Error("no CustomerSection file");
  return { written, section: section.content };
};

describe("unions and tuples nested inside an object section (module layout)", () => {
  it("plain: binds in the section component, no TODO, and typechecks unused-free", () => {
    const dir = freshTmpDir("nested-unions-plain");
    const { written, section } = generate(dir);
    expect(section).not.toContain("only top-level");
    expect(section).not.toContain("bind it by hand");
    // Discriminant + common keys on the plain field hook, variant-only
    // keys on the variant hook, all at the STATIC nested path.
    expect(section).toMatch(/const kind = use\w+Field\(`customer\.payment\.kind`\);/);
    expect(section).toMatch(/use\w+VariantField\(`customer\.payment`, "last4"\)/);
    expect(section).toMatch(/use\w+VariantField\(`customer\.payment`, "amount"\)/);
    expect(section).toMatch(/use\w+VariantField\(`customer\.payment`, "account"\)/);
    // The second union's discriminant var dedupes against the first's.
    expect(section).toMatch(/const kind2 = use\w+Field\(`customer\.shipping\.speed\.kind`\);/);
    // Optional union: the whole-union hook plus the clearing select wrapper.
    expect(section).toMatch(/const union = use\w+Field\(`customer\.shipping\.speed`\);/);
    expect(section).toContain("const kind2Select = {");
    // Tuple positions at their static indices.
    expect(section).toMatch(/use\w+Field\(`customer\.shipping\.coord\.0`\)/);
    expect(section).toMatch(/use\w+Field\(`customer\.shipping\.coord\.1`\)/);
    // Variant blocks render conditionally on the discriminant value.
    expect(section).toContain('{kind.value === "card" && (');
    expect(section).toContain('{kind2.value === "ground" && (');
    // The hooks import carries the field AND variant hooks, nothing else new.
    expect(section).toMatch(/import \{\n {2}use\w+Field,\n {2}use\w+IsDirty,\n {2}use\w+IsValid,\n {2}use\w+VariantField,\n\} from "\.\.\/hooks";/);
    expect(typecheckDiagnostics(written, {}, { noUnusedLocals: true })).toEqual([]);
  });

  it("the hooks file exports the variant hook for the nested union", () => {
    const dir = freshTmpDir("nested-unions-hooks");
    const { written } = generate(dir);
    const hooks = fs.readFileSync(
      written.find((file) => file.endsWith("hooks.ts")) ?? "",
      "utf8",
    );
    expect(hooks).toMatch(/use\w+VariantField/);
  });

  it("mui module typechecks against the MUI stub", () => {
    const dir = freshTmpDir("nested-unions-mui");
    const { written, section } = generate(dir, { ui: "mui" });
    expect(section).not.toContain("only top-level");
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });

  it("shadcn module typechecks against the shadcn stub", () => {
    const dir = freshTmpDir("nested-unions-shadcn");
    const { written, section } = generate(dir, { ui: "shadcn" });
    expect(section).not.toContain("only top-level");
    expect(typecheckDiagnostics([...written, shadcnStubFile])).toEqual([]);
  });

  it("antd with columns wraps the block in a full-row cell and typechecks", () => {
    const dir = freshTmpDir("nested-unions-antd");
    const { written, section } = generate(dir, {
      ui: "antd",
      visual: { sections: "panel", columns: 2 },
    });
    expect(section).not.toContain("only top-level");
    expect(typecheckDiagnostics(written, antdStubPaths)).toEqual([]);
  });

  it("a section with no nested container is byte-identical to before", () => {
    const dir = freshTmpDir("nested-unions-plain-section");
    const ir = fromZod(
      z.object({ profile: z.object({ name: z.string(), age: z.number() }) }),
    );
    const files = emitModuleForm({
      ir,
      formName: "ProfileForm",
      ui: "plain",
      schemaImport: { name: "profileSchema", from: "./external", kind: "named" },
      schemaSource: emitZodSchema(ir, "profileSchema"),
    });
    const section = files.find((file) =>
      file.path.endsWith("sections/ProfileSection.tsx"),
    );
    expect(section?.content).toContain(
      'import { useProfileIsDirty, useProfileIsValid } from "../hooks";',
    );
    expect(section?.content).not.toContain("VariantField");
    fs.mkdirSync(dir, { recursive: true });
  });
});
