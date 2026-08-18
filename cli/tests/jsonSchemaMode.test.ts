import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import {
  freshTmpDir,
  jsonSchemaFixture,
  openApiFixture,
  typecheckDiagnostics,
  zodFixture,
} from "./helpers";

// The .json input mode end to end through main(): a .json input follows the
// type-mode path (the document has no runtime validator, so the zod schema
// is generated beside the component), --schema selects inside OpenAPI
// documents, and the mode-mixing flags fail loudly.

describe("cli json schema mode", () => {
  it("a bare JSON Schema writes a schema + component pair that typechecks", async () => {
    const dir = freshTmpDir("cli-json-bare");
    const out = path.join(dir, "ProfileForm.tsx");

    expect(await main([jsonSchemaFixture, "--out", out])).toBe(0);

    // Named by the document's title: "Profile" → profileSchema/ProfileForm.
    const schemaOut = path.join(dir, "profileSchema.ts");
    const schema = fs.readFileSync(schemaOut, "utf8");
    expect(schema).toContain("export const profileSchema = z.object({");
    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain("export const ProfileForm = () => {");
    expect(code).toContain('import { profileSchema } from "./profileSchema";');
    expect(typecheckDiagnostics([schemaOut, out])).toEqual([]);
  });

  it("--schema picks an OpenAPI component; the full surface typechecks", async () => {
    const dir = freshTmpDir("cli-json-openapi");
    const out = path.join(dir, "OrderForm.tsx");

    expect(
      await main([openApiFixture, "--schema", "Order", "--out", out]),
    ).toBe(0);

    const schemaOut = path.join(dir, "orderSchema.ts");
    const schema = fs.readFileSync(schemaOut, "utf8");
    // The discriminated oneOf survived the round trip into a real validator.
    expect(schema).toContain('z.discriminatedUnion("method"');
    expect(schema).toContain('z.enum(["draft", "placed", "shipped"])');
    // Component + generated schema typecheck against the real library —
    // including the union, tuple, date, and TODO-degraded fields.
    expect(typecheckDiagnostics([schemaOut, out])).toEqual([]);
  });

  it("module layout gets the generated schema as its schema.ts", async () => {
    const dir = freshTmpDir("cli-json-module");
    const out = path.join(dir, "OrderForm");

    expect(
      await main([
        openApiFixture,
        "--schema",
        "Order",
        "--layout",
        "module",
        "--out",
        out,
      ]),
    ).toBe(0);
    expect(fs.readFileSync(path.join(out, "schema.ts"), "utf8")).toContain(
      "export const orderSchema = z.object({",
    );
    expect(fs.existsSync(path.join(out, "index.ts"))).toBe(true);
  });

  it("fails loudly on mode-mixing flags and unsupported inputs", async () => {
    const dir = freshTmpDir("cli-json-errors");
    // --schema needs a .json input.
    expect(await main([zodFixture, "--schema", "Order"])).toBe(1);
    // --type/--export do not apply to .json inputs.
    expect(await main([openApiFixture, "--type", "Order"])).toBe(1);
    expect(await main([openApiFixture, "--export", "Order"])).toBe(1);
    // YAML is named as unsupported, not misparsed.
    const yaml = path.join(dir, "api.yaml");
    fs.writeFileSync(yaml, "openapi: 3.1.0\n", "utf8");
    expect(await main([yaml])).toBe(1);
    // Broken JSON fails with the parse error, not a stack trace.
    const broken = path.join(dir, "broken.json");
    fs.writeFileSync(broken, "{ not json", "utf8");
    expect(await main([broken])).toBe(1);
    // An OpenAPI document with several component schemas needs --schema.
    expect(await main([openApiFixture])).toBe(1);
  });
});
