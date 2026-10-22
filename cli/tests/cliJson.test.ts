// The machine-readable run (--json) and the generator manifest (--manifest):
// one JSON document on stdout and nothing else, so an agent or a script can
// drive formstand-gen without parsing terminal text. The document is pinned
// here shape by shape; the manifest's choice lists must agree with the
// parser's constants, which is what makes a new kit show up in both.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main } from "../src/cli";
import { MUI_VERSIONS, UI_KITS } from "../src/uiTarget";
import { fixturesDir, freshTmpDir, typeFixture, zodFixture } from "./helpers";

type JsonFile = Readonly<{ path: string; content: string; written: boolean }>;
type JsonRun = Readonly<{
  ok: boolean;
  files: readonly JsonFile[];
  notes: readonly string[];
  error?: string;
}>;

// Capture BOTH streams: the contract is that stdout holds exactly one JSON
// document and stderr stays silent for the whole run.
const capture = async (
  run: () => Promise<number>,
): Promise<Readonly<{ code: number; stdout: string; stderr: string }>> => {
  const out: string[] = [];
  const err: string[] = [];
  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: unknown): boolean => {
      out.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(((chunk: unknown): boolean => {
      err.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
  try {
    const code = await run();
    return { code, stdout: out.join(""), stderr: err.join("") };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
};

const parseRun = (text: string): JsonRun => {
  // Exactly one document, newline-terminated, nothing before or after.
  expect(text.endsWith("\n")).toBe(true);
  expect(text.trim().split("\n")).toHaveLength(1);
  return JSON.parse(text) as JsonRun;
};

describe("formstand-gen --json", () => {
  it("describes a zod run without --out: one unwritten file, nothing on disk", async () => {
    const { code, stdout, stderr } = await capture(() => main([zodFixture, "--json"]));
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const run = parseRun(stdout);
    expect(run.ok).toBe(true);
    expect(run.error).toBeUndefined();
    expect(run.files.map((file) => [file.path, file.written])).toEqual([
      ["ProfileForm.tsx", false],
    ]);
    expect(run.files[0]?.content).toContain("export const ProfileForm = () => {");
    expect(run.notes).toEqual([]);
  });

  it("writes under --out and reports the files as written, without 'wrote' notes", async () => {
    const dir = freshTmpDir("cli-json-out");
    const out = path.join(dir, "ProfileForm.tsx");
    const { code, stdout } = await capture(() => main([zodFixture, "--out", out, "--json"]));
    expect(code).toBe(0);
    const run = parseRun(stdout);
    expect(run.ok).toBe(true);
    expect(run.files).toHaveLength(1);
    expect(run.files[0]?.written).toBe(true);
    expect(run.files[0]?.path.endsWith("ProfileForm.tsx")).toBe(true);
    expect(fs.readFileSync(out, "utf8")).toBe(run.files[0]?.content);
    expect(run.notes.some((note) => note.startsWith("wrote "))).toBe(false);
  });

  it("lists every module-layout file with its folder path", async () => {
    const { code, stdout } = await capture(() =>
      main([zodFixture, "--layout", "module", "--json"]),
    );
    expect(code).toBe(0);
    const run = parseRun(stdout);
    const paths = run.files.map((file) => file.path);
    expect(paths).toContain("ProfileForm.tsx");
    expect(paths.some((p) => p.startsWith("fields/"))).toBe(true);
    expect(run.files.every((file) => file.written === false)).toBe(true);
  });

  it("type mode reports the generated schema and the component as two files", async () => {
    const { code, stdout } = await capture(() =>
      main([typeFixture, "--type", "Profile", "--json"]),
    );
    expect(code).toBe(0);
    const run = parseRun(stdout);
    const paths = run.files.map((file) => file.path);
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.endsWith(".ts") && !p.endsWith(".tsx"))).toBe(true);
    expect(paths.some((p) => p.endsWith("Form.tsx"))).toBe(true);
  });

  it("folds warnings into notes", async () => {
    const { code, stdout } = await capture(() =>
      main([path.join(fixturesDir, "recordSchema.ts"), "--json"]),
    );
    expect(code).toBe(0);
    const run = parseRun(stdout);
    expect(run.ok).toBe(true);
    expect(
      run.notes.some((note) =>
        note.includes('field "meta": unsupported zod type "record"'),
      ),
    ).toBe(true);
  });

  it("reports an error as a document with the exit code preserved", async () => {
    const { code, stdout, stderr } = await capture(() =>
      main([path.join(fixturesDir, "does-not-exist.ts"), "--json"]),
    );
    expect(code).toBe(1);
    expect(stderr).toBe("");
    const run = parseRun(stdout);
    expect(run.ok).toBe(false);
    expect(run.files).toEqual([]);
    expect(run.error).toContain("input file not found");
  });

  it("refuses --watch, as a document", async () => {
    const { code, stdout } = await capture(() =>
      main([zodFixture, "--watch", "--out", "x.tsx", "--json"]),
    );
    expect(code).toBe(1);
    const run = parseRun(stdout);
    expect(run.ok).toBe(false);
    expect(run.error).toContain("--watch");
  });

  it("leaves --help as text", async () => {
    const { code, stdout } = await capture(() => main(["--help", "--json"]));
    expect(code).toBe(0);
    expect(stdout.startsWith("{")).toBe(false);
    expect(stdout).toContain("--json");
  });
});

describe("formstand-gen --json, one run per process at a time", () => {
  it("a concurrent second run refuses with its own document and leaves the first intact", async () => {
    // A reviewer's reproduction: the sink is a process-level ref, so a second
    // run that slipped past the guard poured its files into the first
    // document and printed nothing itself.
    const { stdout } = await capture(async () => {
      const [a, b] = await Promise.all([
        main([zodFixture, "--json"]),
        main([typeFixture, "--type", "Profile", "--json"]),
      ]);
      return a === 0 && b === 1 ? 0 : a === 1 && b === 0 ? 0 : 2;
    });
    const docs = stdout.trim().split("\n").map((line) => JSON.parse(line) as JsonRun);
    expect(docs).toHaveLength(2);
    const [okRun, refused] = [docs.find((d) => d.ok), docs.find((d) => !d.ok)];
    expect(okRun?.files.map((file) => file.path)).toEqual(["ProfileForm.tsx"]);
    expect(refused?.error).toContain("another --json run is in progress");
    expect(refused?.files).toEqual([]);
  });

  it("--manifest --json refuses as a document", async () => {
    const { code, stdout, stderr } = await capture(() => main(["--manifest", "--json"]));
    expect(code).toBe(1);
    expect(stderr).toBe("");
    const run = parseRun(stdout);
    expect(run.ok).toBe(false);
    expect(run.error).toContain("--manifest runs alone");
  });
});

describe("formstand-gen --manifest", () => {
  it("prints the generator as data, with the parser's own choice lists", async () => {
    const { code, stdout, stderr } = await capture(() => main(["--manifest"]));
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const doc = JSON.parse(stdout) as Readonly<{
      name: string;
      package: string;
      version: string;
      inputs: readonly Readonly<{ kind: string }>[];
      flags: readonly Readonly<{ flag: string; value?: string }>[];
      ui: readonly Readonly<{ kit: string; versions?: readonly number[] }>[];
      layouts: readonly string[];
      sections: readonly string[];
      columns: readonly number[];
    }>;
    expect(doc.name).toBe("formstand-gen");
    expect(doc.package).toBe("formstand-cli");
    expect(doc.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(doc.inputs.map((input) => input.kind)).toEqual(["zod", "type", "json-schema"]);
    expect(doc.ui.map((entry) => entry.kit)).toEqual([...UI_KITS]);
    expect(doc.ui.find((entry) => entry.kit === "mui")?.versions).toEqual([...MUI_VERSIONS]);
    expect(doc.layouts).toEqual(["single", "module"]);
    expect(doc.sections).toEqual(["flat", "panel", "collapsible"]);
    expect(doc.columns).toEqual([1, 2, 3]);
    const flags = doc.flags.map((entry) => entry.flag);
    expect(flags).toContain("--json");
    expect(flags).toContain("--manifest");
    expect(flags).toContain("--out");
    expect(doc.flags.find((entry) => entry.flag === "--out")?.value).toBeDefined();
    expect(doc.flags.find((entry) => entry.flag === "--force")?.value).toBeUndefined();
  });

  it("runs alone", async () => {
    const { code, stderr } = await capture(() => main(["--manifest", zodFixture]));
    expect(code).toBe(1);
    expect(stderr).toContain("--manifest runs alone");
  });
});
