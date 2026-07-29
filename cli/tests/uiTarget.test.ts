import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import { emitMuiForm } from "../src/codegen";
import { emitModuleForm } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import {
  DEFAULT_MUI_VERSION,
  MUI_VERSIONS,
  parseUiTarget,
} from "../src/uiTarget";
import { freshTmpDir, zodFixture } from "./helpers";
import { profileSchema } from "./fixtures/profileSchema";

// The versioned --ui surface: "mui@5".."mui@9" pin an @mui/material major,
// bare "mui" stays the latest supported major, and the version-free kits
// reject a version. Only React-19-capable majors qualify (formstand peers
// react ^19), and MUI skipped major 8 — hence the 5/6/7/9 set.

describe("parseUiTarget", () => {
  it("parses the version-free kits", () => {
    expect(parseUiTarget("plain")).toEqual({
      kind: "ok",
      target: { kit: "plain" },
    });
    expect(parseUiTarget("shadcn")).toEqual({
      kind: "ok",
      target: { kit: "shadcn" },
    });
  });

  it("bare mui means the latest supported major", () => {
    expect(parseUiTarget("mui")).toEqual({
      kind: "ok",
      target: { kit: "mui", version: DEFAULT_MUI_VERSION },
    });
    expect(DEFAULT_MUI_VERSION).toBe(9);
  });

  it("accepts every supported mui major", () => {
    expect(MUI_VERSIONS).toEqual([5, 6, 7, 9]);
    MUI_VERSIONS.forEach((version) => {
      expect(parseUiTarget(`mui@${version}`)).toEqual({
        kind: "ok",
        target: { kit: "mui", version },
      });
    });
  });

  it("rejects mui@8 with the skipped-major explanation", () => {
    const result = parseUiTarget("mui@8");
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toContain("skipped");
    expect(result.kind === "error" && result.message).toContain('"mui@7"');
  });

  it("rejects pre-React-19 majors with the scope rationale", () => {
    const result = parseUiTarget("mui@4");
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toContain("React 19");
  });

  it("rejects unknown mui versions listing the supported set", () => {
    (["mui@10", "mui@5.1", "mui@", "mui@next"] as const).forEach((value) => {
      const result = parseUiTarget(value);
      expect(result.kind).toBe("error");
      expect(result.kind === "error" && result.message).toContain('"mui@5"');
    });
  });

  it("rejects a version on the version-free kits", () => {
    const plain = parseUiTarget("plain@2");
    expect(plain.kind).toBe("error");
    expect(plain.kind === "error" && plain.message).toContain("takes no version");
    expect(parseUiTarget("shadcn@3").kind).toBe("error");
  });

  it("rejects unknown kits listing the choices", () => {
    (["bootstrap", "mui5", ""] as const).forEach((value) => {
      const result = parseUiTarget(value);
      expect(result.kind).toBe("error");
      expect(result.kind === "error" && result.message).toContain("plain");
    });
  });

  // chakra is UNVERSIONED: v3 is the only React-19-compatible major with the
  // compound-component API the backend emits. "chakra@3" is accepted as the
  // explicit spelling of the same target; older majors error with the scope
  // rationale (like mui@0..4), anything else lists the supported spelling.
  it("chakra parses versionless, with chakra@3 as an explicit alias", () => {
    expect(parseUiTarget("chakra")).toEqual({
      kind: "ok",
      target: { kit: "chakra" },
    });
    expect(parseUiTarget("chakra@3")).toEqual({
      kind: "ok",
      target: { kit: "chakra" },
    });
  });

  it("rejects chakra@2 and chakra@1 with the React-19 scope rationale", () => {
    (["chakra@2", "chakra@1", "chakra@0"] as const).forEach((value) => {
      const result = parseUiTarget(value);
      expect(result.kind).toBe("error");
      expect(result.kind === "error" && result.message).toContain("React 19");
      expect(result.kind === "error" && result.message).toContain('"chakra@3"');
    });
  });

  it("rejects other chakra versions naming the one supported major", () => {
    (["chakra@4", "chakra@", "chakra@next", "chakra@3.1"] as const).forEach(
      (value) => {
        const result = parseUiTarget(value);
        expect(result.kind).toBe("error");
        expect(result.kind === "error" && result.message).toContain(
          '"chakra@3"',
        );
      },
    );
  });
});

// The one empirical prop-surface delta across the supported majors is
// TextField's slot-props API: v5 has only the legacy InputProps /
// InputLabelProps component props, v6+ take slotProps.{input,inputLabel}
// (and v9 REMOVED the legacy spelling). Everything else the backend emits
// typechecks identically against every major — the cli/matrix harness
// proves that against each major's real .d.ts; these pin the emission.
describe("mui version configs", () => {
  const options = {
    ir: fromZod(profileSchema),
    formName: "ProfileForm",
    schemaImport: {
      name: "profileSchema",
      from: "./profileSchema",
      kind: "named",
    },
  } as const;

  it("mui@5 emits the legacy TextField props, never slotProps", () => {
    const code = emitMuiForm({ ...options, muiVersion: 5 });
    expect(code).toContain('InputProps: { inputMode: "decimal" as const },');
    expect(code).toContain("InputLabelProps: { shrink: true },");
    expect(code).not.toContain("slotProps");
  });

  it("the default (and mui@9) emits slotProps, never the legacy props", () => {
    const code = emitMuiForm(options);
    expect(code).toContain(
      'slotProps: { input: { inputMode: "decimal" as const } },',
    );
    expect(code).toContain("slotProps: { inputLabel: { shrink: true } },");
    expect(code).not.toContain("InputProps");
    expect(code).not.toContain("InputLabelProps");
    // Bare mui IS mui@9 — the default path must stay byte-identical.
    expect(emitMuiForm({ ...options, muiVersion: 9 })).toBe(code);
  });

  it("mui@6 and mui@7 share the slot-props emission with mui@9", () => {
    const v9 = emitMuiForm({ ...options, muiVersion: 9 });
    expect(emitMuiForm({ ...options, muiVersion: 6 })).toBe(v9);
    expect(emitMuiForm({ ...options, muiVersion: 7 })).toBe(v9);
  });

  it("the module layout's shared adapter follows the version", () => {
    const moduleOptions = {
      ...options,
      ui: "mui",
      schemaImport: {
        name: "profileSchema",
        from: "../profileSchema",
        kind: "named",
      },
    } as const;
    const adapterOf = (files: readonly { path: string; content: string }[]) =>
      files.find((file) => file.path === "adapter.ts")?.content ?? "";
    const v5 = adapterOf(emitModuleForm({ ...moduleOptions, muiVersion: 5 }));
    expect(v5).toContain("InputLabelProps: { shrink: true },");
    expect(v5).not.toContain("slotProps");
    const dflt = adapterOf(emitModuleForm(moduleOptions));
    expect(dflt).toContain("slotProps: { inputLabel: { shrink: true } },");
    expect(dflt).not.toContain("InputLabelProps");
  });
});

describe("--ui mui@N end to end", () => {
  it("--ui mui@5 reaches the emitted component", async () => {
    const dir = freshTmpDir("ui-target-v5");
    const out = path.join(dir, "Form.tsx");
    expect(
      await main([zodFixture, "--ui", "mui@5", "--out", out]),
    ).toBe(0);
    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain('} from "@mui/material";');
    expect(code).toContain("InputLabelProps: { shrink: true },");
    expect(code).not.toContain("slotProps");
  });

  it("--ui mui and --ui mui@9 write identical output", async () => {
    const dir = freshTmpDir("ui-target-bare");
    const bare = path.join(dir, "Bare.tsx");
    const pinned = path.join(dir, "Pinned.tsx");
    expect(await main([zodFixture, "--ui", "mui", "--out", bare])).toBe(0);
    expect(await main([zodFixture, "--ui", "mui@9", "--out", pinned])).toBe(0);
    expect(fs.readFileSync(pinned, "utf8")).toBe(fs.readFileSync(bare, "utf8"));
  });

  it("unsupported versions fail loudly", async () => {
    expect(await main([zodFixture, "--ui", "mui@8"])).toBe(1);
    expect(await main([zodFixture, "--ui", "mui@4"])).toBe(1);
    expect(await main([zodFixture, "--ui", "plain@1"])).toBe(1);
    expect(await main([zodFixture, "--ui", "chakra@2"])).toBe(1);
  });
});

describe("--ui chakra end to end", () => {
  it("--ui chakra reaches the emitted component in both spellings", async () => {
    const dir = freshTmpDir("ui-target-chakra");
    const bare = path.join(dir, "Bare.tsx");
    const pinned = path.join(dir, "Pinned.tsx");
    expect(await main([zodFixture, "--ui", "chakra", "--out", bare])).toBe(0);
    expect(
      await main([zodFixture, "--ui", "chakra@3", "--out", pinned]),
    ).toBe(0);
    const code = fs.readFileSync(bare, "utf8");
    expect(code).toContain('} from "@chakra-ui/react";');
    expect(code).toContain("<Field.Root invalid={");
    // chakra@3 IS chakra — byte-identical output.
    expect(fs.readFileSync(pinned, "utf8")).toBe(code);
  });

  it("--ui chakra --layout module writes the chakra adapter", async () => {
    const dir = freshTmpDir("ui-target-chakra-module");
    const out = path.join(dir, "ProfileForm");
    expect(
      await main([
        zodFixture,
        "--ui",
        "chakra",
        "--layout",
        "module",
        "--out",
        out,
      ]),
    ).toBe(0);
    const adapter = fs.readFileSync(path.join(out, "adapter.ts"), "utf8");
    expect(adapter).toContain("export const chakraTextInputProps");
  });
});
