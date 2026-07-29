import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main, moduleSpecifier } from "../src/cli";
import {
  type EmitFormOptions,
  collectOptionsProps,
  emitAntdForm,
  emitChakraForm,
  emitMantineForm,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
  emitTemplateForm,
} from "../src/codegen";
import { emitModuleForm } from "../src/moduleLayout";
import { applyFieldOverrides, overridablePaths } from "../src/overrides";
import { defineTemplate } from "../src/template";
import { fromZod } from "../src/fromZod";
import type { FieldSpec } from "../src/ir";
import {
  antdStubPaths,
  chakraStubPaths,
  fixturesDir,
  freshTmpDir,
  mantineStubPaths,
  muiStubPaths,
  shadcnStubFile,
  typecheckDiagnostics,
} from "./helpers";
import { overridesSchema } from "./fixtures/overridesSchema";

// Per-field component overrides (formstand.config.ts `fields`): validation
// against the walked IR, options-prop naming, per-kit emission, threading
// through both layouts, and composition with --live/--form-prop/templates.

const baseIr = fromZod(overridesSchema);

const spectAt = (ir: FieldSpec, segments: readonly string[]): FieldSpec =>
  segments.reduce((spec, segment) => {
    if (spec.kind === "object") {
      const field = spec.fields.find((f) => f.name === segment);
      if (field === undefined) throw new Error(`no field ${segment}`);
      return field.spec;
    }
    if (spec.kind === "array" && segment === "*") return spec.item;
    throw new Error(`cannot descend ${segment}`);
  }, ir);

// Every override the single-file layout supports (crew.*.home.base sits in
// an object nested inside array rows — reachable single-file, module errors).
const SINGLE_OVERRIDES = {
  icao: { component: "autocomplete", optionsProp: true },
  aircraft: { component: "autocomplete" },
  "crew.*.role": { component: "autocomplete", optionsProp: true },
  "crew.*.home.base": { component: "autocomplete", optionsProp: true },
  "tags.*": { component: "autocomplete", optionsProp: true },
  "legs.*.waypoints.*.fix": { component: "autocomplete", optionsProp: true },
  "meta.region": { component: "autocomplete", optionsProp: true },
} as const;

const MODULE_OVERRIDES = {
  icao: { component: "autocomplete", optionsProp: true },
  aircraft: { component: "autocomplete" },
  "crew.*.role": { component: "autocomplete", optionsProp: true },
  "tags.*": { component: "autocomplete", optionsProp: true },
  "legs.*.waypoints.*.fix": { component: "autocomplete", optionsProp: true },
  "meta.region": { component: "autocomplete", optionsProp: true },
} as const;

const singleIr = applyFieldOverrides(baseIr, SINGLE_OVERRIDES, "single");
const moduleIr = applyFieldOverrides(baseIr, MODULE_OVERRIDES, "module");

describe("applyFieldOverrides", () => {
  it("stamps exact and *-matched paths with resolved prop names", () => {
    expect(spectAt(singleIr, ["icao"]).override).toEqual({
      component: "autocomplete",
      optionsPropName: "icaoOptions",
    });
    expect(spectAt(singleIr, ["crew", "*", "role"]).override).toEqual({
      component: "autocomplete",
      optionsPropName: "crewRoleOptions",
    });
    expect(spectAt(singleIr, ["tags", "*"]).override).toEqual({
      component: "autocomplete",
      optionsPropName: "tagsOptions",
    });
    expect(
      spectAt(singleIr, ["legs", "*", "waypoints", "*", "fix"]).override,
    ).toEqual({
      component: "autocomplete",
      optionsPropName: "legsWaypointsFixOptions",
    });
    // An enum without optionsProp bakes its values: no prop name.
    expect(spectAt(singleIr, ["aircraft"]).override).toEqual({
      component: "autocomplete",
    });
    // Untouched siblings stay override-free, and the input IR is not
    // mutated.
    expect(spectAt(singleIr, ["notes"]).override).toBeUndefined();
    expect(spectAt(baseIr, ["icao"]).override).toBeUndefined();
  });

  it("an enum with optionsProp: true REPLACES the baked values with the prop", () => {
    const ir = applyFieldOverrides(baseIr, {
      aircraft: { component: "autocomplete", optionsProp: true },
    });
    expect(spectAt(ir, ["aircraft"]).override).toEqual({
      component: "autocomplete",
      optionsPropName: "aircraftOptions",
    });
  });

  it("an unknown path errors, listing near-miss candidates", () => {
    expect(() =>
      applyFieldOverrides(baseIr, {
        icaso: { component: "autocomplete", optionsProp: true },
      }),
    ).toThrow(/fields\["icaso"\].*does not match any field.*did you mean "icao"/s);
    // The candidate list itself spells rows with "*".
    expect(overridablePaths(baseIr)).toContain("crew.*.role");
    expect(overridablePaths(baseIr)).toContain("tags.*");
  });

  it("naming an array without * errors with the .* hint", () => {
    expect(() =>
      applyFieldOverrides(baseIr, {
        tags: { component: "autocomplete", optionsProp: true },
      }),
    ).toThrow(/kind "array".*to override the rows, use "tags\.\*"/s);
  });

  it("a non-string/enum field errors naming the kind", () => {
    expect(() =>
      applyFieldOverrides(baseIr, {
        "crew.*.years": { component: "autocomplete", optionsProp: true },
      }),
    ).toThrow(/string and enum fields only.*kind "number"/s);
  });

  it("a plain string without optionsProp errors naming the derived prop", () => {
    expect(() =>
      applyFieldOverrides(baseIr, { icao: { component: "autocomplete" } }),
    ).toThrow(/no options source.*optionsProp: true.*icaoOptions: readonly string\[\]/s);
  });

  it("multiple problems aggregate into one loud error", () => {
    expect(() =>
      applyFieldOverrides(baseIr, {
        icao: { component: "autocomplete" },
        nope: { component: "autocomplete", optionsProp: true },
      }),
    ).toThrow(/2 field-override problems:/);
  });

  it("module layout rejects overrides inside row objects; single allows them", () => {
    expect(
      spectAt(singleIr, ["crew", "*", "home", "base"]).override,
    ).toEqual({
      component: "autocomplete",
      optionsPropName: "crewHomeBaseOptions",
    });
    expect(() =>
      applyFieldOverrides(
        baseIr,
        { "crew.*.home.base": { component: "autocomplete", optionsProp: true } },
        "module",
      ),
    ).toThrow(/inside an object nested in array rows.*--layout module/s);
  });

  it("colliding derived names disambiguate with numeric suffixes", () => {
    const ir = applyFieldOverrides(baseIr, {
      crew_role: { component: "autocomplete", optionsProp: true },
      "crew.*.role": { component: "autocomplete", optionsProp: true },
    });
    // Config order wins the unsuffixed name.
    expect(spectAt(ir, ["crew_role"]).override?.optionsPropName).toBe(
      "crewRoleOptions",
    );
    expect(spectAt(ir, ["crew", "*", "role"]).override?.optionsPropName).toBe(
      "crewRoleOptions2",
    );
  });

  it("collectOptionsProps lists the props in IR order with config paths", () => {
    expect(collectOptionsProps(singleIr)).toEqual([
      { name: "icaoOptions", path: "icao" },
      { name: "crewRoleOptions", path: "crew.*.role" },
      { name: "crewHomeBaseOptions", path: "crew.*.home.base" },
      { name: "tagsOptions", path: "tags.*" },
      { name: "legsWaypointsFixOptions", path: "legs.*.waypoints.*.fix" },
      { name: "metaRegionOptions", path: "meta.region" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Single-file emission + typecheck, per kit
// ---------------------------------------------------------------------------

type Emitter = (options: EmitFormOptions) => string;

const generateSingle = (
  emit: Emitter,
  ir: FieldSpec,
  formName: string,
  dir: string,
  extra?: Readonly<Pick<EmitFormOptions, "live" | "formProp">>,
): Readonly<{ file: string; code: string }> => {
  const code = emit({
    ir,
    formName,
    schemaImport: {
      name: "overridesSchema",
      from: moduleSpecifier(dir, path.join(fixturesDir, "overridesSchema.ts")),
      kind: "named",
    },
    ...(extra ?? {}),
  });
  const file = path.join(dir, `${formName}.tsx`);
  fs.writeFileSync(file, code, "utf8");
  return { file, code };
};

// A consumer page proving the options props are REQUIRED and typed
// readonly string[] — the twin's page shape (data-driven airport list).
const writeConsumer = (dir: string): string => {
  const file = path.join(dir, "OverridesPage.tsx");
  fs.writeFileSync(
    file,
    [
      `import { OverridesForm } from "./OverridesForm";`,
      "",
      `const AIRPORTS: readonly string[] = ["KSEA", "KPDX", "KSFO"];`,
      "",
      "export const OverridesPage = () => (",
      "  <OverridesForm",
      "    icaoOptions={AIRPORTS}",
      '    crewRoleOptions={["CA", "FO"]}',
      '    crewHomeBaseOptions={["KSEA"]}',
      '    tagsOptions={["vfr", "ifr"]}',
      '    legsWaypointsFixOptions={["ELMAA"]}',
      '    metaRegionOptions={["NW"]}',
      "  />",
      ");",
      "",
    ].join("\n"),
    "utf8",
  );
  return file;
};

describe("single-file overrides emission", () => {
  const dirs = {
    plain: freshTmpDir("overrides-plain"),
    mui: freshTmpDir("overrides-mui"),
    shadcn: freshTmpDir("overrides-shadcn"),
    chakra: freshTmpDir("overrides-chakra"),
    mantine: freshTmpDir("overrides-mantine"),
    antd: freshTmpDir("overrides-antd"),
  };
  const plain = generateSingle(emitPlainForm, singleIr, "OverridesForm", dirs.plain);
  const mui = generateSingle(emitMuiForm, singleIr, "OverridesForm", dirs.mui);
  const shadcn = generateSingle(emitShadcnForm, singleIr, "OverridesForm", dirs.shadcn);
  const chakra = generateSingle(emitChakraForm, singleIr, "OverridesForm", dirs.chakra);
  const mantine = generateSingle(emitMantineForm, singleIr, "OverridesForm", dirs.mantine);
  const antd = generateSingle(emitAntdForm, singleIr, "OverridesForm", dirs.antd);

  it("every kit's overridden output typechecks (plain with a consumer page)", () => {
    expect(
      typecheckDiagnostics([plain.file, writeConsumer(dirs.plain)]),
    ).toEqual([]);
    expect(typecheckDiagnostics([mui.file], muiStubPaths)).toEqual([]);
    expect(typecheckDiagnostics([shadcn.file, shadcnStubFile])).toEqual([]);
    expect(typecheckDiagnostics([chakra.file], chakraStubPaths)).toEqual([]);
    expect(typecheckDiagnostics([mantine.file], mantineStubPaths)).toEqual([]);
    expect(typecheckDiagnostics([antd.file], antdStubPaths)).toEqual([]);
  });

  it("the component takes the options props (required, readonly) with path comments", () => {
    [plain, mui, shadcn, chakra, mantine, antd].forEach(({ code }) => {
      expect(code).toContain("export type OverridesFormProps = Readonly<{");
      expect(code).toContain(
        '  // Suggestions for the "icao" autocomplete override.',
      );
      expect(code).toContain("  icaoOptions: readonly string[];");
      expect(code).toContain(
        '  // Suggestions for the "crew.*.role" autocomplete override.',
      );
      expect(code).toContain("  crewRoleOptions: readonly string[];");
      // The enum's baked override adds no prop.
      expect(code).not.toContain("aircraftOptions");
    });
  });

  it("plain renders the in-file AutocompleteField with a native datalist", () => {
    expect(plain.code).toContain("const AutocompleteField = ({");
    expect(plain.code).toContain(
      "<input list={`${path}-datalist`} {...textInputProps(field)} />",
    );
    expect(plain.code).toContain("<datalist id={`${path}-datalist`}>");
    expect(plain.code).toContain(
      "{/* autocomplete override: suggestions from the icaoOptions prop; free text stays allowed */}",
    );
    expect(plain.code).toContain("options={icaoOptions}");
    // The enum upgrade bakes its values as suggestions.
    expect(plain.code).toContain(
      "{/* autocomplete override: enum options baked in as suggestions; free text stays allowed */}",
    );
    expect(plain.code).toContain('options={["C172", "SR22", "PC12"]}');
    // No SelectField remains for the overridden enum, and the plain string
    // fields keep their TextField.
    expect(plain.code).not.toContain("SelectField");
    expect(plain.code).toContain("<TextField form={form}");
    // The description keeps plain's separate zf-help slot.
    expect(plain.code).toContain("Four-letter airport code");
  });

  it("mui binds Autocomplete freeSolo through the INPUT value", () => {
    expect(mui.code).toContain("const muiAutocompleteProps = ");
    expect(mui.code).toContain("freeSolo: true as const,");
    expect(mui.code).toContain('inputValue: field.value ?? "",');
    expect(mui.code).toContain(
      "onInputChange: (_event: SyntheticEvent, value: string) => {",
    );
    expect(mui.code).toContain("const BoundAutocompleteField = ({");
    expect(mui.code).toContain("renderInput={(params) => (");
    // The params spread rides the documented 5/6 compatibility cast.
    expect(mui.code).toContain("{...(params as unknown as TextFieldProps)}");
    expect(mui.code).toContain("  type TextFieldProps,");
    expect(mui.code).toContain("helperText={fieldError(field) ?? description}");
    expect(mui.code).toContain("  Autocomplete,");
    expect(mui.code).toContain("type SyntheticEvent } from \"react\";");
    // The overridden enum renders the combobox, not a Select/MenuItem list.
    expect(mui.code).toContain('path={"aircraft"}');
    expect(mui.code).toContain('options={["C172", "SR22", "PC12"]}');
    expect(mui.code).not.toContain("MenuItem");
  });

  it("mantine binds its native Autocomplete (value-shaped, data prop)", () => {
    expect(mantine.code).toContain("const mantineAutocompleteProps = ");
    expect(mantine.code).toContain("onChange: (value: string) => {");
    expect(mantine.code).toContain(
      "<Autocomplete label={label} description={description} data={options} {...mantineAutocompleteProps(field)} />",
    );
    expect(mantine.code).toContain("  Autocomplete,");
  });

  it("antd binds AutoComplete (value-shaped, id fallback, explicit error line)", () => {
    expect(antd.code).toContain("const antdAutoCompleteProps = ");
    expect(antd.code).toContain("// No `name`: antd's AutoComplete renders no form-posting input.");
    expect(antd.code).toContain("<AutoComplete");
    expect(antd.code).toContain("id={path}");
    expect(antd.code).toContain(
      "options={options.map((option) => ({ value: option }))}",
    );
    expect(antd.code).toContain("{...antdAutoCompleteProps(field)}");
    expect(antd.code).toContain("  AutoComplete,");
  });

  it("chakra and shadcn ride Input + native datalist", () => {
    expect(chakra.code).toContain(
      "<Input list={`${path}-datalist`} {...chakraTextInputProps(field)} />",
    );
    expect(chakra.code).toContain("<datalist id={`${path}-datalist`}>");
    expect(chakra.code).toContain("<Field.Root invalid={fieldError(field) !== undefined}>");
    expect(shadcn.code).toContain(
      "<Input id={path} list={`${path}-datalist`} {...shadcnTextInputProps(field)} />",
    );
    expect(shadcn.code).toContain("<datalist id={`${path}-datalist`}>");
  });

  it("row and nested-array leaves thread the props through child components", () => {
    // crew.*.role renders inline in the crew rows (prop in scope from the
    // component params); the nested legs.*.waypoints extraction threads its
    // prop through the child Rows component.
    [plain, mui, shadcn, chakra, mantine, antd].forEach(({ code }) => {
      expect(code).toContain("legsWaypointsFixOptions: readonly string[]");
      expect(code).toContain(
        "legsWaypointsFixOptions={legsWaypointsFixOptions}",
      );
      expect(code).toContain("options={crewRoleOptions}");
    });
  });

  it("composes with --live and --form-prop (options props join the props type)", () => {
    const dir = freshTmpDir("overrides-live-owned");
    const liveOwned = generateSingle(
      emitPlainForm,
      singleIr,
      "OverridesForm",
      dir,
      { live: true, formProp: true },
    );
    expect(liveOwned.code).toContain("form: Form<typeof overridesSchema>;");
    expect(liveOwned.code).toContain("onValuesChange?: (values: FormValues) => void;");
    expect(liveOwned.code).toContain("icaoOptions: readonly string[];");
    expect(liveOwned.code).toContain(
      "export const useOverridesForm = () =>",
    );
    // The combined page: owner hook + form prop + live callback + options.
    const consumer = path.join(dir, "Page.tsx");
    fs.writeFileSync(
      consumer,
      [
        `import { OverridesForm, useOverridesForm } from "./OverridesForm";`,
        "",
        "export const Page = () => {",
        "  const form = useOverridesForm();",
        "  return (",
        "    <OverridesForm",
        "      form={form}",
        "      onValuesChange={(values) => void values}",
        '      icaoOptions={["KSEA"]}',
        '      crewRoleOptions={["CA"]}',
        '      crewHomeBaseOptions={["KSEA"]}',
        '      tagsOptions={["vfr"]}',
        '      legsWaypointsFixOptions={["ELMAA"]}',
        '      metaRegionOptions={["NW"]}',
        "    />",
        "  );",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    expect(typecheckDiagnostics([liveOwned.file, consumer])).toEqual([]);
  });

  it("overrides win over a custom template's per-kind renderer", () => {
    const template = defineTemplate({
      name: "kitx",
      imports: [{ from: "@mantine/core", names: ["TextInput"] }],
      leaf: {
        string: ({ label, bind }) =>
          `<TextInput label={${label}} {...${bind}} />`,
      },
    });
    const dir = freshTmpDir("overrides-template");
    const code = emitTemplateForm(template, {
      ir: singleIr,
      formName: "OverridesForm",
      schemaImport: {
        name: "overridesSchema",
        from: moduleSpecifier(dir, path.join(fixturesDir, "overridesSchema.ts")),
        kind: "named",
      },
    });
    const file = path.join(dir, "OverridesForm.tsx");
    fs.writeFileSync(file, code, "utf8");
    // The overridden icao renders the override control, NOT the template's
    // TextInput; the non-overridden string (notes) still uses the template.
    expect(code).toContain("const BoundAutocompleteField = ({");
    expect(code).toContain(
      "// autocomplete override: the config-fields override wins over the",
    );
    expect(code).toContain("<TextInput label={label} {...textInputProps(field)} />");
    expect(code).toContain('path={"icao"}');
    expect(code).toContain("options={icaoOptions}");
    expect(typecheckDiagnostics([file], mantineStubPaths)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Module layout
// ---------------------------------------------------------------------------

describe("module-layout overrides emission", () => {
  const dir = freshTmpDir("overrides-module");
  const files = emitModuleForm({
    ir: moduleIr,
    formName: "OverridesForm",
    ui: "plain",
    schemaImport: {
      name: "overridesSchema",
      from: moduleSpecifier(dir, path.join(fixturesDir, "overridesSchema.ts")),
      kind: "named",
    },
  });
  const written = files.map((file) => {
    const dest = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    return dest;
  });
  const at = (p: string): string =>
    files.find((f) => f.path === p)?.content ?? "";

  it("field files take the options prop and render the override control", () => {
    const icao = at("fields/IcaoField.tsx");
    expect(icao).toContain(
      "export type IcaoFieldProps = Readonly<{ label?: string; icaoOptions: readonly string[] }>;",
    );
    expect(icao).toContain("icaoOptions,");
    expect(icao).toContain(
      "// autocomplete override: suggestions from the icaoOptions prop; free text stays allowed",
    );
    expect(icao).toContain("<input list={`${field.path}-datalist`} {...textInputProps(field)} />");
    expect(icao).toContain("{icaoOptions.map((option) => (");
    // A section-nested leaf (meta.region) threads through its field file
    // too.
    const region = at("fields/RegionField.tsx");
    expect(region).toContain("metaRegionOptions: readonly string[]");
    // The enum upgrade bakes options into the field file: no prop.
    const aircraft = at("fields/AircraftField.tsx");
    expect(aircraft).toContain('{["C172", "SR22", "PC12"].map((option) => (');
    expect(aircraft).toContain(
      "export type AircraftFieldProps = Readonly<{ label?: string }>;",
    );
  });

  it("sections declare and thread the props to rows and field files", () => {
    const crew = at("sections/CrewSection.tsx");
    expect(crew).toContain(
      "export type CrewSectionProps = Readonly<{ heading?: string; crewRoleOptions: readonly string[] }>;",
    );
    expect(crew).toContain("crewRoleOptions={crewRoleOptions}");
    const meta = at("sections/MetaSection.tsx");
    expect(meta).toContain("metaRegionOptions: readonly string[]");
    expect(meta).toContain("<RegionField metaRegionOptions={metaRegionOptions} />");
    // The nested legs.*.waypoints extraction threads through Rows AND Row.
    const legs = at("sections/LegsSection.tsx");
    expect(legs).toContain(
      "legsWaypointsFixOptions: readonly string[]",
    );
    expect(legs).toContain(
      "legsWaypointsFixOptions={legsWaypointsFixOptions}",
    );
  });

  it("the form file requires the props and passes them down", () => {
    const form = at("OverridesForm.tsx");
    expect(form).toContain("export type OverridesFormProps = Readonly<{");
    expect(form).toContain(
      '  // Suggestions for the "icao" autocomplete override.',
    );
    expect(form).toContain("  icaoOptions: readonly string[];");
    expect(form).toContain("<IcaoField icaoOptions={icaoOptions} />");
    expect(form).toContain(
      "<CrewSection crewRoleOptions={crewRoleOptions} />",
    );
    expect(form).toContain(
      "<LegsSection legsWaypointsFixOptions={legsWaypointsFixOptions} />",
    );
    expect(form).toContain("<MetaSection metaRegionOptions={metaRegionOptions} />");
  });

  it("the whole overridden module typechecks against the library source", () => {
    expect(typecheckDiagnostics(written)).toEqual([]);
  });

  it("a kit module (mantine) emits the exported autocomplete adapter and typechecks", () => {
    const kitDir = freshTmpDir("overrides-module-mantine");
    const kitFiles = emitModuleForm({
      ir: moduleIr,
      formName: "OverridesForm",
      ui: "mantine",
      schemaImport: {
        name: "overridesSchema",
        from: moduleSpecifier(
          kitDir,
          path.join(fixturesDir, "overridesSchema.ts"),
        ),
        kind: "named",
      },
    });
    const kitWritten = kitFiles.map((file) => {
      const dest = path.join(kitDir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });
    const adapter =
      kitFiles.find((f) => f.path.startsWith("adapter."))?.content ?? "";
    expect(adapter).toContain("export const mantineAutocompleteProps = ");
    const icao =
      kitFiles.find((f) => f.path === "fields/IcaoField.tsx")?.content ?? "";
    expect(icao).toContain(
      'import { mantineAutocompleteProps } from "../adapter";',
    );
    // icao's zod .describe() rides mantine's native description slot.
    expect(icao).toContain(
      '<Autocomplete label={label} description={"Four-letter airport code"} data={icaoOptions} {...mantineAutocompleteProps(field)} />',
    );
    expect(typecheckDiagnostics(kitWritten, mantineStubPaths)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CLI end-to-end (config file → generation / loud errors)
// ---------------------------------------------------------------------------

describe("cli config fields overrides", () => {
  const schemaFixture = path.join(fixturesDir, "overridesSchema.ts");

  it("a config fields block drives generation end-to-end", async () => {
    const dir = freshTmpDir("overrides-cli");
    const cfg = path.join(dir, "formstand.config.ts");
    fs.writeFileSync(
      cfg,
      [
        "export default {",
        '  fields: {',
        '    icao: { component: "autocomplete", optionsProp: true },',
        '    aircraft: { component: "autocomplete" },',
        "  },",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    const out = path.join(dir, "Form.tsx");
    expect(
      await main([schemaFixture, "--config", cfg, "--out", out]),
    ).toBe(0);
    const code = fs.readFileSync(out, "utf8");
    expect(code).toContain("icaoOptions: readonly string[];");
    expect(code).toContain("const AutocompleteField = ({");
    expect(code).toContain('options={["C172", "SR22", "PC12"]}');
  });

  it("an unknown override path fails loudly with exit 1 and no output", async () => {
    const dir = freshTmpDir("overrides-cli-bad");
    const cfg = path.join(dir, "formstand.config.ts");
    fs.writeFileSync(
      cfg,
      `export default { fields: { icaso: { component: "autocomplete", optionsProp: true } } };\n`,
      "utf8",
    );
    const out = path.join(dir, "Form.tsx");
    expect(
      await main([schemaFixture, "--config", cfg, "--out", out]),
    ).toBe(1);
    expect(fs.existsSync(out)).toBe(false);
  });

  it("a malformed fields block fails at config load", async () => {
    const dir = freshTmpDir("overrides-cli-shape");
    const cfg = path.join(dir, "formstand.config.ts");
    fs.writeFileSync(
      cfg,
      `export default { fields: { icao: { component: "combobox" } } };\n`,
      "utf8",
    );
    expect(await main([schemaFixture, "--config", cfg])).toBe(1);
  });
});
