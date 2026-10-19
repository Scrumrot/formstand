import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main, parseArgs } from "../src/cli";
import {
  captureStderr,
  fixturesDir,
  freshTmpDir,
  listFiles,
  zodFixture,
} from "./helpers";

// The CLI UX findings from the review: flag negation over config defaults,
// --out naming a directory in the single layout, lowercase component
// names, stale module files under --force, and string-literal export
// names.

const captureStdout = async (run: () => Promise<unknown>): Promise<string> => {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: unknown): boolean => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
};

describe("--no-live and --no-form-prop", () => {
  const writeConfig = (dir: string): string => {
    const file = path.join(dir, "formstand.config.mjs");
    fs.writeFileSync(
      file,
      "export default { live: true, formProp: true };\n",
      "utf8",
    );
    return file;
  };

  it("parse to explicit false", () => {
    const parsed = parseArgs(["in.ts", "--no-live", "--no-form-prop"]);
    if (parsed.kind !== "ok") throw new Error("expected ok");
    expect(parsed.options.live).toBe(false);
    expect(parsed.options.formProp).toBe(false);
  });

  it("explicit false wins over a config file's true", async () => {
    const dir = freshTmpDir("ux-no-live");
    const config = writeConfig(dir);
    const defaulted = path.join(dir, "Defaulted.tsx");
    const text = await captureStderr(async () => {
      expect(
        await main([zodFixture, "--config", config, "--out", defaulted]),
      ).toBe(0);
    });
    expect(text).toContain("wrote");
    const defaultedCode = fs.readFileSync(defaulted, "utf8");
    // The config applied: a live form with a page-owned form prop.
    expect(defaultedCode).toContain("onValuesChange");
    expect(defaultedCode).not.toContain('type="submit"');
    const negated = path.join(dir, "Negated.tsx");
    expect(
      await main([
        zodFixture,
        "--config",
        config,
        "--no-live",
        "--no-form-prop",
        "--out",
        negated,
      ]),
    ).toBe(0);
    const negatedCode = fs.readFileSync(negated, "utf8");
    expect(negatedCode).toContain('type="submit"');
    expect(negatedCode).not.toContain("onValuesChange");
    expect(negatedCode).not.toContain("export const useProfileFormForm");
  });

  it("are listed in --help", async () => {
    const help = await captureStdout(async () => {
      expect(await main(["--help"])).toBe(0);
    });
    expect(help).toContain("--no-live");
    expect(help).toContain("--no-form-prop");
  });
});

describe("--out in the single layout", () => {
  it("refuses a trailing path separator and an existing directory", async () => {
    const dir = freshTmpDir("ux-out-dir");
    const slashText = await captureStderr(async () => {
      expect(await main([zodFixture, "--out", `${dir}${path.sep}`])).toBe(1);
    });
    expect(slashText).toContain("names a directory");
    expect(slashText).toContain("--layout module");
    const existingText = await captureStderr(async () => {
      expect(await main([zodFixture, "--out", dir])).toBe(1);
    });
    expect(existingText).toContain("names a directory");
    // Nothing was written under either spelling.
    expect(listFiles(dir)).toEqual([]);
    // The module layout takes the same directory happily.
    expect(await main([zodFixture, "--layout", "module", "--out", dir])).toBe(0);
  });
});

describe("--name", () => {
  it("requires an uppercase first letter, since React reads <profileForm /> as a DOM tag", () => {
    const parsed = parseArgs(["in.ts", "--name", "profileForm"]);
    if (parsed.kind !== "error") throw new Error("expected error");
    expect(parsed.message).toContain("uppercase");
    expect(parsed.message).toContain("profileForm");
    expect(parseArgs(["in.ts", "--name", "ProfileForm"]).kind).toBe("ok");
  });
});

describe("--force over a module folder", () => {
  it("names generated files the new run no longer writes, deletes nothing, and ignores a user's file", async () => {
    const dir = freshTmpDir("ux-force-stale");
    expect(
      await main([zodFixture, "--layout", "module", "--name", "MyForm", "--out", dir]),
    ).toBe(0);
    const before = listFiles(dir);
    const addressSection = before.find((file) => /AddressSection\.tsx$/.test(file));
    if (addressSection === undefined) throw new Error("expected a section file");
    // A hand-written file beside the generated ones (no generator header).
    const userFile = path.join(dir, "sections", "Notes.tsx");
    fs.writeFileSync(userFile, "export const Notes = () => null;\n", "utf8");
    const text = await captureStderr(async () => {
      expect(
        await main([
          path.join(fixturesDir, "tupleOnlySchema.ts"),
          "--layout",
          "module",
          "--name",
          "MyForm",
          "--force",
          "--out",
          dir,
        ]),
      ).toBe(0);
    });
    // Named, never deleted: the header says the file is the user's to edit,
    // so a stale section may carry hand work, and a folder can hold another
    // run's single-file component under the same header.
    expect(fs.existsSync(addressSection)).toBe(true);
    expect(text).toContain(
      `warning: stale: ${path.relative(process.cwd(), addressSection)}`,
    );
    // The user's own file (no header) is neither named nor touched.
    expect(fs.existsSync(userFile)).toBe(true);
    expect(text).not.toContain("Notes.tsx");
    // Only files from the earlier run that this run did not write are named.
    const written = text
      .split("\n")
      .filter((line) => line.startsWith("wrote "))
      .map((line) => line.slice("wrote ".length));
    const stale = text
      .split("\n")
      .filter((line) => line.startsWith("warning: stale: "));
    expect(stale.length).toBeGreaterThan(0);
    stale.forEach((line) => {
      written.forEach((dest) => expect(line).not.toContain(dest));
    });
  });
});

describe("string-literal export names", () => {
  it("are refused with the rule instead of emitting an unparseable import", async () => {
    const fixture = path.join(fixturesDir, "stringExportSchema.ts");
    const text = await captureStderr(async () => {
      expect(await main([fixture, "--export", "my schema"])).toBe(1);
    });
    expect(text).toContain('"my schema"');
    expect(text).toContain("not a valid identifier");
    // The sole-export fallback hits the same rule.
    const soleText = await captureStderr(async () => {
      expect(await main([fixture])).toBe(1);
    });
    expect(soleText).toContain("not a valid identifier");
  });
});

