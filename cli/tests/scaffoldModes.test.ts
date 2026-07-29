import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { main, moduleSpecifier } from "../src/cli";
import {
  type EmitFormOptions,
  emitAntdForm,
  emitChakraForm,
  emitMantineForm,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
} from "../src/codegen";
import { type ModuleFile, emitModuleForm } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import {
  fixturesDir,
  freshTmpDir,
  muiStubPaths,
  typecheckDiagnostics,
  zodFixture,
} from "./helpers";
import { profileSchema } from "./fixtures/profileSchema";

// The scaffold modes: --live (no-submit forms that stream values to the
// page) and --form-prop (the page owns the form), separately and combined,
// in both layouts, plus their flag/config plumbing.

type Emitter = (options: EmitFormOptions) => string;

const ALL_EMITTERS: readonly Readonly<{ tag: string; emit: Emitter }>[] = [
  { tag: "plain", emit: emitPlainForm },
  { tag: "mui", emit: emitMuiForm },
  { tag: "shadcn", emit: emitShadcnForm },
  { tag: "chakra", emit: emitChakraForm },
  { tag: "mantine", emit: emitMantineForm },
  { tag: "antd", emit: emitAntdForm },
];

const emitProfile = (
  emit: Emitter,
  extra: Readonly<Pick<EmitFormOptions, "live" | "formProp">>,
): string =>
  emit({
    ir: fromZod(profileSchema),
    formName: "ProfileForm",
    schemaImport: {
      name: "profileSchema",
      from: "./profileSchema",
      kind: "named",
    },
    ...extra,
  });

// A schema with no arrays: the kit backends' only Button is the submit
// control, so --live must drop the import entirely.
const arrayFreeSchema = z.object({ name: z.string(), active: z.boolean() });

const emitArrayFree = (
  emit: Emitter,
  extra: Readonly<Pick<EmitFormOptions, "live" | "formProp">>,
): string =>
  emit({
    ir: fromZod(arrayFreeSchema),
    formName: "SuitabilityForm",
    schemaImport: {
      name: "suitabilitySchema",
      from: "./suitabilitySchema",
      kind: "named",
    },
    ...extra,
  });

const emitProfileModule = (
  extra: Readonly<
    Pick<EmitFormOptions, "live" | "formProp"> & { ui?: "plain" | "mui" }
  >,
): readonly ModuleFile[] =>
  emitModuleForm({
    ir: fromZod(profileSchema),
    formName: "ProfileForm",
    schemaImport: {
      name: "profileSchema",
      from: "../profileSchema",
      kind: "named",
    },
    ...extra,
  });

const fileContent = (files: readonly ModuleFile[], at: string): string => {
  const found = files.find((file) => file.path === at);
  if (found === undefined) throw new Error(`no module file ${at}`);
  return found.content;
};

describe("--live emission (single file)", () => {
  it("plain: omits the whole submit scaffold and wires onValuesChange", () => {
    const code = emitProfile(emitPlainForm, { live: true });
    expect(code).not.toContain("handleSubmit");
    expect(code).not.toContain('type="submit"');
    expect(code).not.toContain("useIsSubmitting");
    expect(code).not.toContain("submitting");
    expect(code).toContain(`import { useEffect } from "react";`);
    expect(code).toContain('mode: "onChange"');
    expect(code).toContain("onValuesChange?: (values: FormValues) => void;");
    expect(code).toContain("form.watchValues(onValuesChange)");
    expect(code).toContain("event.preventDefault();");
    // The root element keeps the <form> semantics.
    expect(code).toContain("    <form");
  });

  it("every kit drops the submit control and useIsSubmitting", () => {
    ALL_EMITTERS.forEach(({ emit }) => {
      const code = emitProfile(emit, { live: true });
      expect(code).not.toContain('type="submit"');
      expect(code).not.toContain('htmlType="submit"');
      expect(code).not.toContain("useIsSubmitting");
      expect(code).toContain("event.preventDefault();");
      expect(code).toContain("form.watchValues(onValuesChange)");
      expect(code).toContain('mode: "onChange"');
    });
  });

  it("kit Button imports survive for array rows, drop when array-free", () => {
    // profileSchema has a field array: add/remove buttons keep Button.
    expect(emitProfile(emitMuiForm, { live: true })).toContain("  Button,");
    // No arrays: the submit button was the only Button.
    expect(emitArrayFree(emitMuiForm, { live: true })).not.toContain("Button");
    expect(emitArrayFree(emitShadcnForm, { live: true })).not.toContain(
      "@/components/ui/button",
    );
    expect(emitArrayFree(emitAntdForm, { live: true })).not.toContain(
      "Button",
    );
  });
});

describe("--form-prop emission (single file)", () => {
  it("plain: the component takes a typed form prop, useForm moves to a hook", () => {
    const code = emitProfile(emitPlainForm, { formProp: true });
    expect(code).toContain(`import type { Form } from "formstand";`);
    expect(code).toContain("export const useProfileForm = () =>");
    expect(code).toContain(
      `  useForm(profileSchema, { initialValues, mode: "onBlur" });`,
    );
    expect(code).toContain("form: Form<typeof profileSchema>;");
    expect(code).toContain(
      "export const ProfileForm = ({ form }: ProfileFormProps) => {",
    );
    expect(code).not.toContain("const form = useForm(");
    // The submit scaffold stays — only ownership moved.
    expect(code).toContain("handleSubmit");
    expect(code).toContain('type="submit"');
    expect(code).toContain("useIsSubmitting");
    // Single file has no pre-wired singleton, so no split-brain guard: any
    // instance of the schema's form works (the fields bind through the
    // prop). The guard is module-layout-only.
    expect(code).not.toContain("is not this module's own instance");
  });

  it("combined with --live: pure rendering over a passed form", () => {
    const code = emitProfile(emitPlainForm, { live: true, formProp: true });
    // The exported owner hook carries the live mode default.
    expect(code).toContain("export const useProfileForm = () =>");
    expect(code).toContain(
      `  useForm(profileSchema, { initialValues, mode: "onChange" });`,
    );
    expect(code).toContain(
      "export const ProfileForm = ({ form, onValuesChange }: ProfileFormProps) => {",
    );
    // The subscription targets the PASSED form.
    expect(code).toContain("form.watchValues(onValuesChange)");
    expect(code).toContain("    [form, onValuesChange],");
    expect(code).not.toContain("const form = useForm(");
    expect(code).not.toContain("handleSubmit");
    expect(code).not.toContain('type="submit"');
  });
});

describe("module layout scaffold modes", () => {
  it("--live: hooks.ts defaults mode onChange, the form file subscribes", () => {
    const files = emitProfileModule({ live: true });
    const hooks = fileContent(files, "hooks.ts");
    expect(hooks).toContain('mode: "onChange",');
    // The pre-wired hook API is the module's public surface; it keeps
    // useProfileIsSubmitting even though the live form file no longer
    // renders from it.
    expect(hooks).toContain("useProfileIsSubmitting,");
    const form = fileContent(files, "ProfileForm.tsx");
    expect(form).not.toContain("useProfileIsSubmitting");
    expect(form).not.toContain('type="submit"');
    expect(form).not.toContain("handleSubmit");
    expect(form).toContain(`import { useEffect } from "react";`);
    expect(form).toContain(
      "onValuesChange?: (values: ProfileValues) => void;",
    );
    expect(form).toContain("profileForm.watchValues(onValuesChange)");
    // The singleton is module-scoped, so it is not an effect dependency.
    expect(form).toContain("    [onValuesChange],");
    expect(form).toContain("event.preventDefault();");
  });

  it("--form-prop: the form file runs its shell on the passed instance", () => {
    const files = emitProfileModule({ formProp: true });
    // hooks.ts is untouched: the singleton stays the hooks' backing form.
    expect(fileContent(files, "hooks.ts")).toContain('mode: "onBlur",');
    const form = fileContent(files, "ProfileForm.tsx");
    expect(form).toContain(
      `import { useIsSubmitting, type Form } from "formstand";`,
    );
    expect(form).toContain("form: Form<ProfileSchema>;");
    expect(form).toContain(
      "export const ProfileForm = ({ form }: ProfileFormProps) => {",
    );
    expect(form).toContain("  const submitting = useIsSubmitting(form);");
    expect(form).toContain("form.handleSubmit((data) => {");
    // The only ./hooks import left is the singleton — imported for the
    // dev-mode split-brain guard, not for the shell (which runs on the
    // prop). (This pin used to assert NO ./hooks import; the guard changed
    // that deliberately — see the guard test below.)
    expect(form).toContain('import { profileForm } from "./hooks";');
    expect(form).not.toContain("useProfileIsSubmitting");
  });

  it("--form-prop: the form file emits the dev-mode split-brain guard", () => {
    const files = emitProfileModule({ formProp: true });
    const form = fileContent(files, "ProfileForm.tsx");
    expect(form).toContain('process.env["NODE_ENV"] !== "production" &&');
    expect(form).toContain("form !== profileForm");
    expect(form).toContain(
      "ProfileForm: the passed form is not this module's own instance from ./hooks — fields are pre-wired to the module form, so state will split. Pass profileForm (see ProfileFormProps docs).",
    );
    // --live --form-prop keeps the guard too (the split is the same).
    const liveForm = fileContent(
      emitProfileModule({ live: true, formProp: true }),
      "ProfileForm.tsx",
    );
    expect(liveForm).toContain("form !== profileForm");
    // Without --form-prop there is nothing to guard (no form prop exists).
    expect(
      fileContent(emitProfileModule({}), "ProfileForm.tsx"),
    ).not.toContain("form !== profileForm");
  });

  it("--live --form-prop: subscription over the prop, no formstand values import", () => {
    const files = emitProfileModule({ live: true, formProp: true });
    const form = fileContent(files, "ProfileForm.tsx");
    expect(form).toContain(`import type { Form } from "formstand";`);
    expect(form).toContain(
      `import type { ProfileSchema, ProfileValues } from "./types";`,
    );
    expect(form).toContain("form.watchValues(onValuesChange)");
    expect(form).toContain("    [form, onValuesChange],");
    expect(form).not.toContain("useIsSubmitting");
    expect(form).not.toContain('type="submit"');
  });

  it("shadcn --live: the Button import line disappears from the form file", () => {
    const files = emitModuleForm({
      ir: fromZod(profileSchema),
      formName: "ProfileForm",
      ui: "shadcn",
      schemaImport: {
        name: "profileSchema",
        from: "../profileSchema",
        kind: "named",
      },
      live: true,
    });
    expect(fileContent(files, "ProfileForm.tsx")).not.toContain(
      "@/components/ui/button",
    );
  });
});

// Write a module's files under dir/sub and return their absolute paths.
const writeModule = (
  dir: string,
  sub: string,
  extra: Readonly<
    Pick<EmitFormOptions, "live" | "formProp"> & { ui?: "plain" | "mui" }
  >,
): readonly string[] => {
  const moduleDir = path.join(dir, sub);
  const files = emitModuleForm({
    ir: fromZod(profileSchema),
    formName: "ProfileForm",
    schemaImport: {
      name: "profileSchema",
      from: moduleSpecifier(
        moduleDir,
        path.join(fixturesDir, "profileSchema.ts"),
      ),
      kind: "named",
    },
    ...extra,
  });
  return files.map((file) => {
    const abs = path.join(moduleDir, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content, "utf8");
    return abs;
  });
};

describe("module layout scaffold typecheck proofs", () => {
  it("plain modules: live, form-prop, and combined + page consumer typecheck", () => {
    const dir = freshTmpDir("scaffold-module-plain");
    const written = [
      ...writeModule(dir, "Live", { live: true }),
      ...writeModule(dir, "Owned", { formProp: true }),
      ...writeModule(dir, "LiveOwned", { live: true, formProp: true }),
    ];
    // The composition the modes exist for: the page holds the module's own
    // instance, feeds it to the UI, and subscribes to the values.
    const page = path.join(dir, "LiveOwnedPage.tsx");
    fs.writeFileSync(
      page,
      [
        `import { ProfileForm } from "./LiveOwned/ProfileForm";`,
        `import { profileForm } from "./LiveOwned/hooks";`,
        "",
        "export const LiveOwnedPage = () => (",
        "  <ProfileForm",
        "    form={profileForm}",
        "    onValuesChange={(values) => void values}",
        "  />",
        ");",
        "",
      ].join("\n"),
      "utf8",
    );
    expect(typecheckDiagnostics([...written, page])).toEqual([]);
  });

  it("mui module: the combined scaffold typechecks against the MUI stub", () => {
    const dir = freshTmpDir("scaffold-module-mui");
    const written = writeModule(dir, "LiveOwned", {
      ui: "mui",
      live: true,
      formProp: true,
    });
    expect(typecheckDiagnostics(written, muiStubPaths)).toEqual([]);
  });
});

describe("scaffold-mode flags and config", () => {
  it("--live --form-prop through the CLI, single-file layout", async () => {
    const dir = freshTmpDir("scaffold-flags-single");
    const out = path.join(dir, "Form.tsx");
    expect(
      await main([zodFixture, "--live", "--form-prop", "--out", out]),
    ).toBe(0);
    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain('mode: "onChange"');
    expect(code).toContain("form: Form<typeof profileSchema>;");
    expect(code).not.toContain('type="submit"');
  });

  it("--live --form-prop through the CLI, module layout", async () => {
    const dir = freshTmpDir("scaffold-flags-module");
    const out = path.join(dir, "ProfileForm");
    expect(
      await main([
        zodFixture,
        "--layout",
        "module",
        "--live",
        "--form-prop",
        "--out",
        out,
      ]),
    ).toBe(0);
    const form = fs.readFileSync(path.join(out, "ProfileForm.tsx"), "utf8");
    expect(form).toContain("form: Form<ProfileSchema>;");
    expect(form).toContain("onValuesChange?: (values: ProfileValues) => void;");
    expect(fs.readFileSync(path.join(out, "hooks.ts"), "utf8")).toContain(
      'mode: "onChange",',
    );
  });

  it("config keys live/formProp apply, and explicit flags stay compatible", async () => {
    const dir = freshTmpDir("scaffold-config");
    const cfg = path.join(dir, "formstand.config.ts");
    fs.writeFileSync(
      cfg,
      `export default { live: true, formProp: true };\n`,
      "utf8",
    );
    const out = path.join(dir, "Form.tsx");
    expect(await main([zodFixture, "--config", cfg, "--out", out])).toBe(0);
    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain('mode: "onChange"');
    expect(code).toContain("form: Form<typeof profileSchema>;");
    expect(code).not.toContain('type="submit"');
  });

  it("non-boolean config values fail loudly", async () => {
    const dir = freshTmpDir("scaffold-config-bad");
    const bad = path.join(dir, "formstand.config.ts");
    fs.writeFileSync(bad, `export default { live: "yes" };\n`, "utf8");
    expect(await main([zodFixture, "--config", bad])).toBe(1);
    fs.writeFileSync(bad, `export default { formProp: 1 };\n`, "utf8");
    expect(await main([zodFixture, "--config", bad])).toBe(1);
  });

  it("misspelled boolean flags are rejected like any unknown flag", async () => {
    expect(await main([zodFixture, "--live=true"])).toBe(1);
    expect(await main([zodFixture, "--formProp"])).toBe(1);
  });
});
