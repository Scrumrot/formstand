import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main, moduleSpecifier } from "../src/cli";
import { emitModuleForm, joinModuleFiles } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import {
  fixturesDir,
  freshTmpDir,
  muiStubPaths,
  realShadcnPaths,
  shadcnStubFile,
  typecheckDiagnostics,
  zodFixture,
} from "./helpers";
import { profileSchema } from "./fixtures/profileSchema";
import { hostileSchema } from "./fixtures/hostileSchema";
import { collidingSchema } from "./fixtures/collidingSchema";
import { leafFreeSchema } from "./fixtures/leafFreeSchema";

// Emit a module for a named fixture schema into `dir`, write every file
// preserving the folder structure, and return the files + written paths.
const generateModule = (
  schema: unknown,
  schemaName: string,
  formName: string,
  dir: string,
  ui: "plain" | "mui" | "shadcn" = "plain",
  visual?: Readonly<{ sections: "flat" | "panel" | "collapsible"; columns: 1 | 2 | 3 }>,
) => {
  const files = emitModuleForm({
    ir: fromZod(schema),
    formName,
    ui,
    schemaImport: {
      name: schemaName,
      from: moduleSpecifier(dir, path.join(fixturesDir, `${schemaName}.ts`)),
      kind: "named",
    },
    ...(visual === undefined ? {} : { visual }),
  });
  const written = files.map((file) => {
    const dest = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    return dest;
  });
  return { files, written };
};

describe("emitModuleForm", () => {
  const dir = freshTmpDir("module-profile");
  const { files, written } = generateModule(
    profileSchema,
    "profileSchema",
    "ProfileForm",
    dir,
  );

  it("emits the feature-module folder shape", () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain("schema.ts");
    expect(paths).toContain("types.ts");
    expect(paths).toContain("hooks.ts");
    expect(paths).toContain("ProfileForm.tsx");
    expect(paths).toContain("index.ts");
    // Top-level scalars become field files; section leaves too.
    expect(paths).toContain("fields/FirstNameField.tsx");
    expect(paths).toContain("fields/CityField.tsx");
    // Top-level object and array become sections.
    expect(paths).toContain("sections/AddressSection.tsx");
    expect(paths).toContain("sections/ContactsSection.tsx");
    // Array-row fields bind template paths inline — no files for them.
    expect(paths).not.toContain("fields/EmailField.tsx");
  });

  it("bakes the name into the hook API", () => {
    const hooks = files.find((f) => f.path === "hooks.ts");
    expect(hooks?.content).toContain('createFormHooks(profileForm, "profile")');
    expect(hooks?.content).toContain("useProfileField,");
    expect(hooks?.content).toContain("useProfileFieldArray,");
    expect(hooks?.content).toContain("useProfileIsDirty,");
    const section = files.find(
      (f) => f.path === "sections/ContactsSection.tsx",
    );
    expect(section?.content).toContain(
      "useProfileField(`contacts.${index}.email`)",
    );
    expect(section?.content).toContain('useProfileIsDirty("contacts")');
  });

  // THE BIG ONE: the whole emitted module must typecheck against the real
  // library source with strict on and zero diagnostics.
  it("the emitted module typechecks against the library source", () => {
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});

describe("emitModuleForm edge inputs", () => {
  it("hostile, colliding, and leaf-free schemas all typecheck", () => {
    const hostile = generateModule(
      hostileSchema,
      "hostileSchema",
      "HostileForm",
      freshTmpDir("module-hostile"),
    );
    const colliding = generateModule(
      collidingSchema,
      "collidingSchema",
      "CollidingForm",
      freshTmpDir("module-colliding"),
    );
    const leafFree = generateModule(
      leafFreeSchema,
      "leafFreeSchema",
      "LeafFreeForm",
      freshTmpDir("module-leaf-free"),
    );

    // Colliding top-level arrays get suffixed section identifiers.
    const collidingPaths = colliding.files.map((f) => f.path);
    expect(collidingPaths).toContain("sections/UserNamesSection.tsx");
    expect(collidingPaths).toContain("sections/UserNamesSection2.tsx");

    // Hostile dot-keys surface as TODO comments, not bindings.
    expect(joinModuleFiles(hostile.files)).toContain(
      'field "a.b" skipped — "." in a key is not path-addressable',
    );

    expect(
      typecheckDiagnostics([
        ...hostile.written,
        ...colliding.written,
        ...leafFree.written,
      ]),
    ).toEqual([]);
  });
});

describe("emitModuleForm kit uis", () => {
  it("mui modules share one adapter file and typecheck against the MUI stub", () => {
    const dir = freshTmpDir("module-mui");
    const { files, written } = generateModule(
      profileSchema,
      "profileSchema",
      "ProfileForm",
      dir,
      "mui",
    );
    const paths = files.map((f) => f.path);
    expect(paths).toContain("adapter.ts");
    const adapter = files.find((f) => f.path === "adapter.ts");
    expect(adapter?.content).toContain("export const muiTextFieldProps");
    const field = files.find((f) => f.path === "fields/FirstNameField.tsx");
    expect(field?.content).toContain('from "../adapter"');
    expect(field?.content).toContain("<TextField fullWidth");
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });

  it("shadcn modules typecheck against the stub AND the real Radix components", () => {
    const dir = freshTmpDir("module-shadcn");
    const { files, written } = generateModule(
      profileSchema,
      "profileSchema",
      "ProfileForm",
      dir,
      "shadcn",
    );
    const paths = files.map((f) => f.path);
    expect(paths).toContain("adapter.tsx");
    const adapter = files.find((f) => f.path === "adapter.tsx");
    expect(adapter?.content).toContain("export const FieldError");
    expect(adapter?.content).toContain("export const ariaInvalid");
    const field = files.find((f) => f.path === "fields/RoleField.tsx");
    expect(field?.content).toContain('from "@/components/ui/select"');
    expect(typecheckDiagnostics([...written, shadcnStubFile])).toEqual([]);
    expect(typecheckDiagnostics(written, realShadcnPaths)).toEqual([]);
  });

  it("leaf-free kit modules omit the adapter and still typecheck", () => {
    const dir = freshTmpDir("module-mui-leaf-free");
    const { files, written } = generateModule(
      leafFreeSchema,
      "leafFreeSchema",
      "LeafFreeForm",
      dir,
      "mui",
    );
    expect(files.map((f) => f.path)).not.toContain("adapter.ts");
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });
});

describe("emitModuleForm visual options", () => {
  // One non-default combo per ui: the section files carry the chrome, and
  // each combo still typechecks against the same programs as the defaults.
  it("mui collapsible sections wrap in Accordions and typecheck", () => {
    const dir = freshTmpDir("module-mui-collapsible");
    const { files, written } = generateModule(
      profileSchema,
      "profileSchema",
      "ProfileForm",
      dir,
      "mui",
      { sections: "collapsible", columns: 2 },
    );
    const section = files.find((f) => f.path.startsWith("sections/"));
    expect(section?.content).toContain("<Accordion defaultExpanded");
    expect(section?.content).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
    expect(section?.content).toContain('} from "@mui/material";');
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });

  it("shadcn panel sections get card chrome + tailwind grid and typecheck", () => {
    const dir = freshTmpDir("module-shadcn-panel");
    const { files, written } = generateModule(
      profileSchema,
      "profileSchema",
      "ProfileForm",
      dir,
      "shadcn",
      { sections: "panel", columns: 2 },
    );
    const section = files.find((f) => f.path.startsWith("sections/"));
    expect(section?.content).toContain("bg-card text-card-foreground shadow-sm");
    expect(section?.content).toContain("md:grid-cols-2");
    expect(typecheckDiagnostics([...written, shadcnStubFile])).toEqual([]);
  });

  it("plain collapsible sections use details/summary and typecheck", () => {
    const dir = freshTmpDir("module-plain-collapsible");
    const { files, written } = generateModule(
      profileSchema,
      "profileSchema",
      "ProfileForm",
      dir,
      "plain",
      { sections: "collapsible", columns: 3 },
    );
    const section = files.find((f) => f.path.startsWith("sections/"));
    expect(section?.content).toContain("<details open>");
    expect(section?.content).toContain('gridTemplateColumns: "repeat(3, minmax(0, 1fr))"');
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});

describe("--layout module via the CLI", () => {
  it("writes the folder and refuses to overwrite", async () => {
    const dir = freshTmpDir("module-cli");
    const out = path.join(dir, "ProfileForm");

    expect(
      await main([zodFixture, "--layout", "module", "--out", out]),
    ).toBe(0);
    expect(fs.existsSync(path.join(out, "hooks.ts"))).toBe(true);
    expect(fs.existsSync(path.join(out, "fields", "FirstNameField.tsx"))).toBe(
      true,
    );

    // All destinations are pre-checked: a second run without --force fails.
    expect(
      await main([zodFixture, "--layout", "module", "--out", out]),
    ).toBe(1);
    expect(
      await main([zodFixture, "--layout", "module", "--out", out, "--force"]),
    ).toBe(0);

    expect(await main([zodFixture, "--layout", "bogus"])).toBe(1);
  });

  it("streams multi-file output to stdout without --out", async () => {
    expect(await main([zodFixture, "--layout", "module"])).toBe(0);
  });
});
