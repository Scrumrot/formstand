import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import { freshTmpDir, typeFixture, zodFixture } from "./helpers";

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

  it("errors cleanly", async () => {
    expect(await main([])).toBe(1);
    expect(await main(["does-not-exist.ts"])).toBe(1);
    expect(await main([zodFixture, "--ui", "bootstrap"])).toBe(1);
    expect(await main([zodFixture, "--export", "nope", "--out", "x.tsx"])).toBe(1);
    expect(await main(["--help"])).toBe(0);
  });
});
