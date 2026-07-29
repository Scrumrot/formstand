// The UI-kit version matrix: PROVES the CLI's kit output compiles against
// the real installed type declarations — every supported @mui/material
// major (5, 6, 7, 9 — MUI skipped 8) for --ui mui@N, @chakra-ui/react 3
// for --ui chakra, @mantine/core 9 for --ui mantine, and antd 6 for
// --ui antd — in BOTH layouts, by typechecking freshly generated forms
// against each package's real .d.ts (installed side by side in this folder
// under npm aliases mui5/mui6/mui7/mui9/chakra3/mantine9/antd6;
// @mantine/hooks installs under its real name — mantine9's .d.ts resolves
// it node-style).
//
// Opt-in: `npm install` in cli/matrix once (a chunky, isolated install — not
// part of the root or cli installs), then `npm run matrix` from cli/. Not
// part of the default vitest suite on purpose.
//
// Each kit/version compiles as one ts.createProgram with the kit's bare
// specifier mapped onto the aliased package, `formstand` mapped onto the
// library source (the same pinning the cli typecheck tests use), and
// react/zod pinned to single copies. A literal-attribute Probe.tsx is
// generated per kit from the emitted adapter's props style: JSX SPREADS
// bypass TypeScript's excess-property checks, so a wrong-shaped adapter
// would compile silently — the probe restates the props as literal
// attributes, which are checked, so a wrong prop surface fails here.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const matrixDir = path.dirname(fileURLToPath(import.meta.url));
const cliDir = path.resolve(matrixDir, "..");
const repoRoot = path.resolve(cliDir, "..");
const outRoot = path.join(matrixDir, ".generated");

const requireFromCli = createRequire(path.join(cliDir, "package.json"));
const ts = requireFromCli("typescript");
const { createJiti } = requireFromCli("jiti");

const jiti = createJiti(import.meta.url);
const api = await jiti.import(
  pathToFileURL(path.join(cliDir, "src", "codegen-api.ts")).href,
);

// The kitchen-sink fixture: every scalar kind, wrappers, a nested object,
// arrays of objects, a tuple — plus the three-level nested-array stress
// schema. Reused from the playground's generated-demo inputs.
const fixtureFile = path.join(
  repoRoot,
  "examples",
  "src",
  "generated",
  "boundarySchemas.ts",
);
const schemas = await jiti.import(pathToFileURL(fixtureFile).href);
const kitchenSinkIr = api.fromZod(schemas.kitchenSinkSchema);
const nestedArrayIr = api.fromZod(schemas.nestedArrayStressSchema);

// A described twin of the kitchen sink: a description on every scalar leaf
// (containers recursed, union variant fields and tuple elements included),
// so each kit's helper-text slot — Bound component props, inline union
// literals, module-layout field files, mantine's native `description` prop,
// chakra's Field.HelperText, antd's Typography.Text line — typechecks
// against the real installed .d.ts in BOTH layouts. The text carries quotes
// to exercise the emitters' escaping. Derived from the IR (plain data), so
// the shared playground fixture stays untouched.
const withDescriptions = (spec) => {
  switch (spec.kind) {
    case "object":
      return {
        ...spec,
        fields: spec.fields.map((f) => ({ ...f, spec: withDescriptions(f.spec) })),
      };
    case "array":
      return { ...spec, item: withDescriptions(spec.item) };
    case "tuple":
      return { ...spec, elements: spec.elements.map(withDescriptions) };
    case "union":
      return {
        ...spec,
        variants: spec.variants.map((v) => ({
          ...v,
          fields: v.fields.map((f) => ({ ...f, spec: withDescriptions(f.spec) })),
        })),
      };
    default:
      return { ...spec, description: 'helper "text" — 1,000 lbs' };
  }
};
const describedIr = withDescriptions(kitchenSinkIr);

const posix = (p) => p.replace(/\\/g, "/");
const nm = (p) => posix(path.join(matrixDir, "node_modules", p));

// `kitPaths` maps the kit's bare specifier onto its aliased install (e.g.
// { "@mui/material": [nm("mui5")] } or { "@chakra-ui/react": [nm("chakra3")] }).
// exactOptionalPropertyTypes is deliberately ON: several kits type their
// optional props without `| undefined` (antd's `status?: InputStatus`,
// mantine's `error?`), so emitted output must never write an explicit
// undefined into them — the strictest consumers compile with the flag.
const compilerOptions = (kitPaths) => ({
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  exactOptionalPropertyTypes: true,
  skipLibCheck: true,
  noEmit: true,
  esModuleInterop: true,
  paths: {
    formstand: [posix(path.join(repoRoot, "src", "index.ts"))],
    zod: [nm("zod/index.d.ts")],
    react: [nm("@types/react")],
    "react/jsx-runtime": [nm("@types/react/jsx-runtime")],
    ...kitPaths,
  },
});

// The literal-attribute restatement of the mui adapter's TextField props
// style (see the header comment for why spreads alone can't catch this).
const muiProbeSource = (usesSlotProps) =>
  [
    'import { TextField } from "@mui/material";',
    "",
    "export const Probe = () => (",
    "  <>",
    ...(usesSlotProps
      ? [
          '    <TextField slotProps={{ input: { inputMode: "decimal" as const } }} />',
          "    <TextField slotProps={{ inputLabel: { shrink: true } }} />",
        ]
      : [
          '    <TextField InputProps={{ inputMode: "decimal" as const }} />',
          "    <TextField InputLabelProps={{ shrink: true }} />",
        ]),
    "  </>",
    ");",
    "",
  ].join("\n");

// The chakra probe: literal-attribute restatement of every prop surface the
// chakra adapters SPREAD onto the compound parts (Input text/number/date
// props, the NativeSelect.Field select binding, Switch.Root's checked
// details callback) — spreads bypass excess-property checks, literals don't.
const CHAKRA_PROBE = [
  'import { Input, NativeSelect, Switch } from "@chakra-ui/react";',
  "",
  "export const Probe = () => (",
  "  <>",
  '    <Input name="n" value="" onChange={(e) => void e.target.value} onBlur={() => {}} />',
  '    <Input inputMode="decimal" name="n" value="" onChange={() => {}} onBlur={() => {}} />',
  '    <Input type="date" name="n" value="" onChange={() => {}} onBlur={() => {}} />',
  "    <NativeSelect.Root>",
  "      <NativeSelect.Field",
  '        placeholder="Select one"',
  '        name="n"',
  '        value=""',
  "        onChange={(e) => void e.target.value}",
  "        onBlur={() => {}}",
  "      >",
  '        <option value="a">{"A"}</option>',
  "      </NativeSelect.Field>",
  "      <NativeSelect.Indicator />",
  "    </NativeSelect.Root>",
  '    <Switch.Root name="n" checked onCheckedChange={(details) => void details.checked} onBlur={() => {}}>',
  "      <Switch.HiddenInput />",
  "      <Switch.Control>",
  "        <Switch.Thumb />",
  "      </Switch.Control>",
  '      <Switch.Label>{"On"}</Switch.Label>',
  "    </Switch.Root>",
  "  </>",
  ");",
  "",
].join("\n");

// The mantine probe: literal-attribute restatement of every prop surface the
// mantine adapters SPREAD onto the controls (TextInput text/number/date
// bindings with the built-in error prop, the NativeSelect select binding
// with option children, Switch's DOM checked/onChange) — spreads bypass
// excess-property checks, literals don't. No-error states restate what the
// emitted fieldError helper actually produces (a string | undefined VALUE,
// legal under exactOptionalPropertyTypes because mantine declares the prop
// with `| undefined`) — never a hand-written shape the adapter stopped
// emitting.
const MANTINE_PROBE = [
  'import { NativeSelect, Switch, TextInput } from "@mantine/core";',
  "",
  "export const Probe = () => (",
  "  <>",
  '    <TextInput label={"Name"} error={"required"} name="n" value="" onChange={(e) => void e.target.value} onBlur={() => {}} />',
  '    <TextInput inputMode="decimal" label={"Age"} error={undefined} name="n" value="" onChange={() => {}} onBlur={() => {}} />',
  '    <TextInput type="date" label={"Born"} error={undefined} name="n" value="" onChange={() => {}} onBlur={() => {}} />',
  "    <NativeSelect",
  '      label={"Role"}',
  '      error={"required"}',
  '      name="n"',
  '      value=""',
  "      onChange={(e) => void e.target.value}",
  "      onBlur={() => {}}",
  "    >",
  '      <option value="">{"Select role"}</option>',
  '      <option value="a">{"A"}</option>',
  "    </NativeSelect>",
  '    <Switch label={"Active"} name="n" checked onChange={(e) => void e.target.checked} onBlur={() => {}} />',
  "  </>",
  ");",
  "",
].join("\n");

// The antd probe: literal-attribute restatement of every prop surface the
// antd adapters SPREAD onto the controls — the DOM-shaped Input bindings
// (text/number/date with the status prop), the VALUE-shaped Select binding
// (antd has no native <select>; onChange receives the value directly, value
// may be null for the placeholder), and Checkbox's CheckboxChangeEvent
// (e.target.checked) — spreads bypass excess-property checks, literals
// don't. The inline-adapter shapes (the value-shaped onChange signatures)
// are restated with their explicit parameter types. The no-status lines
// restate fieldStatus's actual no-error value, "" (a member of antd's
// InputStatus union) — status={undefined} is a shape the adapter no longer
// emits, and exactOptionalPropertyTypes rightly rejects it.
const ANTD_PROBE = [
  'import type { ChangeEvent } from "react";',
  'import { Checkbox, Input, Select, type CheckboxChangeEvent } from "antd";',
  "",
  "export const Probe = () => (",
  "  <>",
  "    <Input",
  '      id="p"',
  '      name="n"',
  '      value=""',
  '      status={"error" as const}',
  "      onChange={(e: ChangeEvent<HTMLInputElement>) => void e.target.value}",
  "      onBlur={() => {}}",
  "    />",
  '    <Input inputMode="decimal" name="n" value="" status="" onChange={() => {}} onBlur={() => {}} />',
  '    <Input type="date" name="n" value="" status="" onChange={() => {}} onBlur={() => {}} />',
  "    <Select",
  '      id="p"',
  '      placeholder="Select role"',
  '      options={[{ value: "a", label: "A" }]}',
  "      value={null as string | null}",
  '      status={"error" as const}',
  "      onChange={(value: string) => void value}",
  "      onBlur={() => {}}",
  "    />",
  "    <Checkbox",
  '      name="n"',
  "      checked",
  "      onChange={(e: CheckboxChangeEvent) => void e.target.checked}",
  "      onBlur={() => {}}",
  "    >",
  '      {"On"}',
  "    </Checkbox>",
  "  </>",
  ");",
  "",
].join("\n");

// ONE parameterized generator for every kit job: the fixture copy, the
// single-file variants (default chrome plus every non-default section
// wrapper and grid), the module-layout variants (flat default, collapsible,
// and PANEL — the panel job exists because module-panel emitters were once
// typechecked nowhere and a deliberate typo shipped green), and the
// literal-attribute probe. Returns the file list functionally — no
// in-place mutation.
const generateKit = ({ alias, emitSingle, moduleUi, moduleExtra, probe }) => {
  // The output folder is named after the alias the job typechecks against.
  const dir = path.join(outRoot, alias);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(fixtureFile, path.join(dir, "boundarySchemas.ts"));

  const writeFile = (rel, content) => {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
    return abs;
  };

  const single = (formName, ir, name, visual, extra) =>
    writeFile(
      `single/${formName}.tsx`,
      emitSingle({
        ir,
        formName,
        schemaImport: { name, from: "../boundarySchemas", kind: "named" },
        ...(visual === undefined ? {} : { visual }),
        ...(extra ?? {}),
      }),
    );

  const moduleForm = (folder, ir, name, formName, visual) =>
    api
      .emitModuleForm({
        ir,
        formName,
        ui: moduleUi,
        schemaImport: { name, from: "../../boundarySchemas", kind: "named" },
        ...(moduleExtra ?? {}),
        ...(visual === undefined ? {} : { visual }),
      })
      .map((file) => writeFile(path.join("module", folder, file.path), file.content));

  const files = [
    single("KitchenSinkForm", kitchenSinkIr, "kitchenSinkSchema"),
    single("KitchenSinkPanel", kitchenSinkIr, "kitchenSinkSchema", {
      sections: "panel",
      columns: 2,
    }),
    single("KitchenSinkCollapsible", kitchenSinkIr, "kitchenSinkSchema", {
      sections: "collapsible",
      columns: 3,
    }),
    single("NestedArrayForm", nestedArrayIr, "nestedArrayStressSchema"),
    single("KitchenSinkDescribed", describedIr, "kitchenSinkSchema"),
    // The scaffold modes (--live / --form-prop) ride ONE combined variant
    // per kit — deliberately not the full mode × chrome × layout
    // cross-product: the scaffold is a shared layer (the per-kit deltas are
    // the shell strings and the Button import gating, both exercised here),
    // and the single-mode variants are already typechecked per kit in the
    // cli test suite (typecheck.test.ts / scaffoldModes.test.ts).
    single("LiveOwnedForm", kitchenSinkIr, "kitchenSinkSchema", undefined, {
      live: true,
      formProp: true,
    }),
    ...moduleForm(
      "KitchenSink",
      kitchenSinkIr,
      "kitchenSinkSchema",
      "KitchenSinkForm",
      { sections: "collapsible", columns: 2 },
    ),
    ...moduleForm(
      "KitchenSinkPanel",
      kitchenSinkIr,
      "kitchenSinkSchema",
      "KitchenSinkPanelForm",
      { sections: "panel", columns: 2 },
    ),
    ...moduleForm(
      "NestedArrays",
      nestedArrayIr,
      "nestedArrayStressSchema",
      "NestedArrayForm",
    ),
    ...moduleForm(
      "KitchenSinkDescribed",
      describedIr,
      "kitchenSinkSchema",
      "KitchenSinkDescribedForm",
    ),
  ];
  const readGenerated = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
  return [...files, writeFile("Probe.tsx", probe(readGenerated))];
};

// One job per kit/version, as data: mui@5..9 against the aliased
// @mui/material majors, chakra@3 against the aliased @chakra-ui/react v3,
// mantine@9 against the aliased @mantine/core v9, antd@6 against the
// aliased antd v6. `alias` is the installed node_modules name the job
// typechecks against — the staleness gate below derives from it, so a new
// job can't silently typecheck against the repo root's copy.
const jobs = [
  ...api.MUI_VERSIONS.map((version) => ({
    label: `mui@${version}`,
    alias: `mui${version}`,
    kitPaths: { "@mui/material": [nm(`mui${version}`)] },
    emitSingle: (options) => api.emitMuiForm({ ...options, muiVersion: version }),
    moduleUi: "mui",
    moduleExtra: { muiVersion: version },
    // The mui probe restates the emitted slot-props style, read back from
    // the generated adapter (v5 legacy InputProps vs v6+ slotProps).
    probe: (readGenerated) =>
      muiProbeSource(
        readGenerated("single/KitchenSinkForm.tsx").includes("slotProps: {"),
      ),
  })),
  {
    label: "chakra@3",
    alias: "chakra3",
    kitPaths: { "@chakra-ui/react": [nm("chakra3")] },
    emitSingle: api.emitChakraForm,
    moduleUi: "chakra",
    probe: () => CHAKRA_PROBE,
  },
  {
    label: "mantine@9",
    alias: "mantine9",
    kitPaths: { "@mantine/core": [nm("mantine9")] },
    emitSingle: api.emitMantineForm,
    moduleUi: "mantine",
    probe: () => MANTINE_PROBE,
  },
  {
    label: "antd@6",
    alias: "antd6",
    kitPaths: { antd: [nm("antd6")] },
    emitSingle: api.emitAntdForm,
    moduleUi: "antd",
    probe: () => ANTD_PROBE,
  },
];

// The stale-install gate, derived from the jobs themselves (single source
// of truth): EVERY alias a job typechecks against must be installed, or the
// missing kit would resolve node-style to the repo root's copy (e.g.
// @mui/material v9 for a missing mui6/mui7 alias) and "prove" the wrong
// major. Fail loudly, naming what's missing.
const missingAliases = [...new Set(jobs.map((job) => job.alias))].filter(
  (alias) => !fs.existsSync(path.join(matrixDir, "node_modules", alias)),
);
if (missingAliases.length > 0) {
  process.stderr.write(
    `matrix: node_modules missing or stale — aliases not installed: ${missingAliases.join(
      ", ",
    )}; run \`npm install\` in cli/matrix first (a chunky, isolated install)\n`,
  );
  process.exit(1);
}

const formatDiagnostic = (d) => {
  const message = ts.flattenDiagnosticMessageText(d.messageText, " | ");
  if (d.file === undefined || d.start === undefined) return `TS${d.code} ${message}`;
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  return `${path.relative(matrixDir, d.file.fileName)}:${line + 1} TS${d.code} ${message}`;
};

fs.rmSync(outRoot, { recursive: true, force: true });

const results = jobs.map((job) => {
  const files = generateKit(job);
  const started = Date.now();
  const program = ts.createProgram(files, compilerOptions(job.kitPaths));
  const diagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ].map(formatDiagnostic);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  process.stderr.write(
    `${job.label} (${files.length} files, ${seconds}s): ${
      diagnostics.length === 0 ? "clean" : `${diagnostics.length} diagnostics`
    }\n`,
  );
  diagnostics.forEach((d) => process.stderr.write(`  ${d}\n`));
  return diagnostics.length;
});

const failures = results.filter((count) => count > 0).length;
process.stderr.write(
  failures === 0
    ? `matrix: all ${results.length} kit targets (mui majors + chakra 3 + mantine 9 + antd 6) typecheck both layouts\n`
    : `matrix: ${failures} target(s) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
