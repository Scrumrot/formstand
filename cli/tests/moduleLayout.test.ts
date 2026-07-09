import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main, moduleSpecifier } from "../src/cli";
import { emitModuleForm, joinModuleFiles } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import { fixturesDir, freshTmpDir, typecheckDiagnostics, zodFixture } from "./helpers";
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
) => {
  const files = emitModuleForm({
    ir: fromZod(schema),
    formName,
    schemaImport: {
      name: schemaName,
      from: moduleSpecifier(dir, path.join(fixturesDir, `${schemaName}.ts`)),
      kind: "named",
    },
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

describe("--layout module via the CLI", () => {
  it("writes the folder, refuses to overwrite, and gates non-plain uis", async () => {
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

    expect(
      await main([zodFixture, "--layout", "module", "--ui", "mui"]),
    ).toBe(1);
    expect(await main([zodFixture, "--layout", "bogus"])).toBe(1);
  });

  it("streams multi-file output to stdout without --out", async () => {
    expect(await main([zodFixture, "--layout", "module"])).toBe(0);
  });
});
