import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import { defineConfig } from "../src/config";
import { freshTmpDir, zodFixture } from "./helpers";

// formstand.config.ts: project defaults for ui/layout/sections/columns.
// Precedence is flags > config > built-in defaults.

const writeConfig = (dir: string, body: string): string => {
  const file = path.join(dir, "formstand.config.ts");
  fs.writeFileSync(file, body, "utf8");
  return file;
};

describe("config file", () => {
  it("config values apply when flags are absent", async () => {
    const dir = freshTmpDir("config-applies");
    const cfg = writeConfig(
      dir,
      `export default { ui: "mui", sections: "panel", columns: 2 };\n`,
    );
    const out = path.join(dir, "Form.tsx");
    expect(await main([zodFixture, "--config", cfg, "--out", out])).toBe(0);
    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain('} from "@mui/material";');
    expect(code).toContain('<Card variant="outlined"');
    expect(code).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
  });

  it("explicit flags beat the config", async () => {
    const dir = freshTmpDir("config-flags-win");
    const cfg = writeConfig(dir, `export default { ui: "mui" };\n`);
    const out = path.join(dir, "Form.tsx");
    expect(
      await main([zodFixture, "--config", cfg, "--ui", "plain", "--out", out]),
    ).toBe(0);
    const code = fs.readFileSync(out, "utf8");
    expect(code).not.toContain("@mui/material");
    expect(code).toContain('} from "formstand";');
  });

  it("defineConfig round-trips and typos fail loudly", async () => {
    expect(defineConfig({ ui: "shadcn" })).toEqual({ ui: "shadcn" });
    const dir = freshTmpDir("config-invalid");
    const bad = writeConfig(dir, `export default { ui: "bootstrap" };\n`);
    expect(await main([zodFixture, "--config", bad])).toBe(1);
    expect(await main([zodFixture, "--config", path.join(dir, "nope.ts")])).toBe(1);
  });

  it("--watch requires --out", async () => {
    expect(await main([zodFixture, "--watch"])).toBe(1);
  });
});
