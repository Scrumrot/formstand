import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import {
  type WizardAnswers,
  type WizardIo,
  composeWizardArgs,
  composeWizardCommand,
  runWizard,
} from "../src/wizard";
import { fixturesDir, freshTmpDir } from "./helpers";

// The --wizard interview: scripted-answer runs (no TTY, no child process —
// the WizardIo seam is the whole point), the composed-command semantics
// shared with the playground's builder, and the opt-in guarantees.

// A scripted io: answers consumed in order, prompts and said lines
// captured for assertions. The queue index is the one sanctioned mutable
// (a scripted conversation is inherently sequential state).
const scriptedIo = (
  answers: readonly string[],
  fileExists: (filePath: string) => boolean = () => true,
): Readonly<{
  io: WizardIo;
  prompts: readonly string[];
  said: readonly string[];
}> => {
  const state = { next: 0 };
  const prompts: string[] = [];
  const said: string[] = [];
  return {
    io: {
      ask: (prompt) => {
        prompts.push(prompt);
        const answer = answers[state.next];
        state.next += 1;
        return answer === undefined
          ? Promise.reject(new Error("input ended before the wizard finished"))
          : Promise.resolve(answer);
      },
      say: (line) => {
        said.push(line);
      },
      fileExists,
    },
    prompts,
    said,
  };
};

const BASE: WizardAnswers = {
  input: "src/schema.ts",
  mode: "zod",
  exportName: "",
  typeName: "",
  ui: "plain",
  layout: "single",
  sections: "flat",
  columns: "1",
  name: "",
  out: "",
  schemaOut: "",
  live: false,
  formProp: false,
  force: false,
};

describe("composeWizardArgs", () => {
  it("omits every default, like the playground command builder", () => {
    expect(composeWizardArgs(BASE)).toEqual(["src/schema.ts"]);
    expect(composeWizardCommand(BASE)).toBe("formstand-gen src/schema.ts");
  });

  it("spells every non-default answer as its flag", () => {
    const argv = composeWizardArgs({
      ...BASE,
      mode: "type",
      typeName: "Profile",
      ui: "mui@5",
      layout: "module",
      sections: "panel",
      columns: "2",
      name: "ProfileForm",
      out: "src/ProfileForm",
      live: true,
      formProp: true,
      force: true,
    });
    expect(argv).toEqual([
      "src/schema.ts",
      "--type",
      "Profile",
      "--ui",
      "mui@5",
      "--layout",
      "module",
      "--sections",
      "panel",
      "--columns",
      "2",
      "--name",
      "ProfileForm",
      "--out",
      "src/ProfileForm",
      "--live",
      "--form-prop",
      "--force",
    ]);
  });

  it("gates --export to zod mode and --schema-out to type mode + single file", () => {
    // exportName answered but mode is type: no --export.
    expect(
      composeWizardArgs({ ...BASE, mode: "type", typeName: "T", exportName: "s" }),
    ).not.toContain("--export");
    // schema-out with module layout: the module's schema.ts owns it.
    expect(
      composeWizardArgs({
        ...BASE,
        mode: "type",
        typeName: "T",
        layout: "module",
        out: "src/F",
        schemaOut: "x.ts",
      }),
    ).not.toContain("--schema-out");
    expect(
      composeWizardArgs({ ...BASE, mode: "type", typeName: "T", schemaOut: "x.ts" }),
    ).toEqual(["src/schema.ts", "--type", "T", "--schema-out", "x.ts"]);
  });

  it("quotes arguments carrying spaces in the printed command", () => {
    expect(
      composeWizardCommand({ ...BASE, input: "my schemas/profile.ts" }),
    ).toBe('formstand-gen "my schemas/profile.ts"');
  });
});

describe("runWizard", () => {
  // The all-defaults walk: input, mode, export, ui, layout, sections,
  // columns, name, out, live, form-prop, generate-now.
  const DEFAULT_WALK = ["src/schema.ts", "", "", "", "", "", "", "", "", "", "", ""];

  it("an all-Enter interview composes the minimal command and runs", async () => {
    const { io, said } = scriptedIo(DEFAULT_WALK);
    const outcome = await runWizard(io);
    expect(outcome).toEqual({ kind: "run", argv: ["src/schema.ts"] });
    expect(said).toContain("  formstand-gen src/schema.ts");
  });

  it("declining the final confirm still prints the command and succeeds", async () => {
    const { io, said } = scriptedIo([...DEFAULT_WALK.slice(0, -1), "n"]);
    const outcome = await runWizard(io);
    expect(outcome.kind).toBe("printed");
    expect(said).toContain("  formstand-gen src/schema.ts");
  });

  it("re-asks on an invalid choice, an empty required answer, and a bad name", async () => {
    const { io, said } = scriptedIo([
      "", // input: required — re-asks
      "src/schema.ts",
      "7", // mode: not an option — re-asks
      "1", // zod
      "", // export
      "banana", // ui: not an option — re-asks
      "2", // mui
      "", // layout
      "", // sections
      "", // columns
      "delete", // name: reserved word — re-asks
      "ProfileForm",
      "", // out
      "", // live
      "", // form-prop
      "", // generate now
    ]);
    const outcome = await runWizard(io);
    expect(outcome).toEqual({
      kind: "run",
      argv: ["src/schema.ts", "--ui", "mui", "--name", "ProfileForm"],
    });
    expect(said).toContain("  the input file is required");
    expect(said).toContain('  "7" is not one of the options');
    expect(said).toContain('  "banana" is not one of the options');
    expect(
      said.some((line) => line.includes("must be a valid identifier")),
    ).toBe(true);
  });

  it("a missing input file asks before being used anyway", async () => {
    const { io } = scriptedIo(
      [
        "typo/schema.ts",
        "n", // do not use the missing path — re-asks
        "real/schema.ts",
        "y", // real/schema.ts "missing" too in this fake fs — use anyway
        ...DEFAULT_WALK.slice(1),
      ],
      () => false,
    );
    const outcome = await runWizard(io);
    expect(outcome).toEqual({ kind: "run", argv: ["real/schema.ts"] });
  });

  it("an existing output target asks for --force; declining re-asks the path", async () => {
    const { io } = scriptedIo(
      [
        "src/schema.ts",
        "", // mode
        "", // export
        "", // ui
        "", // layout
        "", // sections
        "", // columns
        "", // name
        "src/Taken.tsx", // exists — overwrite?
        "n", // no: re-asks the path
        "src/Fresh.tsx", // exists too in this fake fs
        "y", // overwrite: --force
        "", // live
        "", // form-prop
        "", // generate now
      ],
      // The input file and every output candidate "exist".
      () => true,
    );
    const outcome = await runWizard(io);
    expect(outcome).toEqual({
      kind: "run",
      argv: ["src/schema.ts", "--out", "src/Fresh.tsx", "--force"],
    });
  });

  it("the module layout requires an output folder", async () => {
    const { io, said } = scriptedIo(
      [
        "src/schema.ts",
        "", // mode
        "", // export
        "", // ui
        "2", // module
        "", // sections
        "", // columns
        "", // name
        "", // out: required for module — re-asks
        "src/ProfileForm",
        "", // live
        "", // form-prop
        "", // generate now
      ],
      // Only the input exists, so the fresh output folder asks nothing.
      (filePath) => filePath === "src/schema.ts",
    );
    const outcome = await runWizard(io);
    expect(outcome).toEqual({
      kind: "run",
      argv: ["src/schema.ts", "--layout", "module", "--out", "src/ProfileForm"],
    });
    expect(said).toContain(
      "  the module layout writes a folder, so --out is required",
    );
  });
});

describe("main --wizard", () => {
  it("runs alone: any other flag is an error", async () => {
    const code = await main(["--wizard", "--ui", "mui"]);
    expect(code).toBe(1);
  });

  it("drives a real generation end to end through the composed argv", async () => {
    const dir = freshTmpDir("wizard-e2e");
    const input = path.join(fixturesDir, "profileSchema.ts");
    const out = path.join(dir, "WizardForm.tsx");
    const { io, said } = scriptedIo(
      [
        input,
        "", // zod
        "", // export
        "", // plain
        "", // single
        "", // flat
        "", // 1 column
        "WizardForm",
        out,
        "", // live
        "", // form-prop
        "", // generate now (default yes)
      ],
      (filePath) => fs.existsSync(filePath),
    );
    const code = await main(["--wizard"], io);
    expect(code).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.readFileSync(out, "utf8")).toContain("export const WizardForm");
    expect(
      said.some((line) => line.startsWith("  formstand-gen ")),
    ).toBe(true);
  });

  it("an interview the input cuts short exits 1, not a hang", async () => {
    const { io } = scriptedIo(["src/schema.ts"]); // everything after ends
    const code = await main(["--wizard"], io);
    expect(code).toBe(1);
  });
});
