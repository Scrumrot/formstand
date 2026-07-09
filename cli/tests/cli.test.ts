import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isInvokedAsScript, main } from "../src/cli";
import {
  defaultExportFixture,
  freshTmpDir,
  typeFixture,
  typecheckDiagnostics,
  zodFixture,
} from "./helpers";

describe("cli main", () => {
  it("zod mode writes a component with --out and refuses to overwrite", async () => {
    const dir = freshTmpDir("cli-zod");
    const out = path.join(dir, "ProfileForm.tsx");

    expect(await main([zodFixture, "--out", out])).toBe(0);
    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain("export const ProfileForm = () => {");
    expect(code).toContain("useForm(profileSchema");
    expect(code).toContain('import { profileSchema } from "../../fixtures/profileSchema";');

    expect(await main([zodFixture, "--out", out])).toBe(1);
    expect(await main([zodFixture, "--out", out, "--force"])).toBe(0);
  });

  it("type mode writes schema + component files", async () => {
    const dir = freshTmpDir("cli-type");
    const out = path.join(dir, "ProfileForm.tsx");
    const schemaOut = path.join(dir, "profileSchema.gen.ts");

    expect(
      await main([
        typeFixture,
        "--type",
        "Profile",
        "--ui",
        "mui",
        "--out",
        out,
        "--schema-out",
        schemaOut,
      ]),
    ).toBe(0);

    const schema = fs.readFileSync(schemaOut, "utf8");
    expect(schema).toContain("export const profileSchema = z.object({");

    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain('} from "@mui/material";');
    expect(code).toContain('import { profileSchema } from "./profileSchema.gen";');
    expect(code).toContain("export const ProfileForm = () => {");
  });

  it("type mode defaults --schema-out next to --out", async () => {
    const dir = freshTmpDir("cli-type-default");
    const out = path.join(dir, "MyForm.tsx");
    expect(
      await main([typeFixture, "--type", "Profile", "--name", "MyForm", "--out", out]),
    ).toBe(0);
    expect(fs.existsSync(path.join(dir, "profileSchema.ts"))).toBe(true);
    expect(fs.readFileSync(out, "utf8")).toContain("export const MyForm = () => {");
  });

  it("--export default emits a default import that typechecks", async () => {
    const dir = freshTmpDir("cli-default-export");
    const out = path.join(dir, "GeneratedForm.tsx");
    expect(
      await main([defaultExportFixture, "--export", "default", "--out", out]),
    ).toBe(0);
    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain('import schema from');
    expect(code).toContain("useForm(schema");
    expect(typecheckDiagnostics([out])).toEqual([]);
  });

  it("type mode checks both destinations before writing either", async () => {
    const dir = freshTmpDir("cli-atomic");
    const out = path.join(dir, "ProfileForm.tsx");
    fs.writeFileSync(out, "// existing component", "utf8");

    expect(await main([typeFixture, "--type", "Profile", "--out", out])).toBe(1);
    // The refusal happened before anything was written: no schema file, and
    // the existing component is untouched.
    expect(fs.existsSync(path.join(dir, "profileSchema.ts"))).toBe(false);
    expect(fs.readFileSync(out, "utf8")).toBe("// existing component");
  });

  it("type mode honors --schema-out on the stdout path", async () => {
    const dir = freshTmpDir("cli-schema-out");
    const schemaOut = path.join(dir, "profileSchema.ts");
    expect(
      await main([typeFixture, "--type", "Profile", "--schema-out", schemaOut]),
    ).toBe(0);
    expect(fs.readFileSync(schemaOut, "utf8")).toContain(
      "export const profileSchema = z.object({",
    );
  });

  it("errors cleanly", async () => {
    expect(await main([])).toBe(1);
    expect(await main(["does-not-exist.ts"])).toBe(1);
    expect(await main([zodFixture, "--ui", "bootstrap"])).toBe(1);
    expect(await main([zodFixture, "--sections", "tabs"])).toBe(1);
    expect(await main([zodFixture, "--columns", "4"])).toBe(1);
    expect(await main([zodFixture, "--columns"])).toBe(1);
    expect(await main([zodFixture, "--export", "nope", "--out", "x.tsx"])).toBe(1);
    expect(await main(["--help"])).toBe(0);
  });

  it("--sections/--columns reach the emitted component", async () => {
    const dir = freshTmpDir("cli-visual");
    const out = path.join(dir, "PanelForm.tsx");
    expect(
      await main([zodFixture, "--sections", "panel", "--columns", "2", "--out", out]),
    ).toBe(0);
    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain('border: "1px solid #d0d7e2"');
    expect(code).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
  });
});

describe("isInvokedAsScript", () => {
  it("matches a direct path and rejects undefined/unrelated ones", () => {
    const dir = freshTmpDir("cli-invoked");
    const real = path.join(dir, "real.js");
    fs.writeFileSync(real, "// entry", "utf8");
    const realUrl = pathToFileURL(fs.realpathSync(real)).href;

    expect(isInvokedAsScript(real, realUrl)).toBe(true);
    expect(isInvokedAsScript(undefined, realUrl)).toBe(false);
    expect(isInvokedAsScript(path.join(dir, "other.js"), realUrl)).toBe(false);
  });

  it("resolves a symlinked argv[1] (the npm .bin shim case)", () => {
    const dir = freshTmpDir("cli-symlink");
    const real = path.join(dir, "real.js");
    fs.writeFileSync(real, "// entry", "utf8");
    const link = path.join(dir, "link.js");
    const created = ((): boolean => {
      try {
        fs.symlinkSync(real, link, "file");
        return true;
      } catch {
        // Symlink creation needs privileges on Windows — skip gracefully.
        return false;
      }
    })();
    if (!created) return;
    const realUrl = pathToFileURL(fs.realpathSync(real)).href;
    expect(isInvokedAsScript(link, realUrl)).toBe(true);
  });
});
