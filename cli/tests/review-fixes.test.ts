import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { main, moduleSpecifier } from "../src/cli";
import { camelIdent, pascalCase } from "../src/casing";
import { emitPlainForm, emitZodSchema } from "../src/codegen";
import { emitMuiForm } from "../src/codegen";
import { emitModuleForm, joinModuleFiles } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import { freshTmpDir, muiStubPaths, typecheckDiagnostics, zodFixture } from "./helpers";
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
      "<CardContent sx={{ display",
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
