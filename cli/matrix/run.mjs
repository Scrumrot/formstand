// The MUI version matrix: PROVES the CLI's --ui mui@N output compiles
// against every supported @mui/material major (5, 6, 7, 9 — MUI skipped 8),
// in BOTH layouts, by typechecking freshly generated forms against each
// major's real .d.ts (installed side by side in this folder under npm
// aliases mui5/mui6/mui7/mui9).
//
// Opt-in: `npm install` in cli/matrix once (a chunky, isolated install — not
// part of the root or cli installs), then `npm run matrix` from cli/. Not
// part of the default vitest suite on purpose.
//
// Each version compiles as one ts.createProgram with `@mui/material` mapped
// onto the aliased major, `formstand` mapped onto the library source (the
// same pinning the cli typecheck tests use), and react/zod pinned to single
// copies. A literal-attribute Probe.tsx is generated per version from the
// emitted adapter's TextField props style: JSX SPREADS bypass TypeScript's
// excess-property checks, so a wrong-style adapter would compile silently —
// the probe restates the style as literal attributes, which are checked, so
// a wrong per-version config fails here.
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

if (!fs.existsSync(path.join(matrixDir, "node_modules", "mui5"))) {
  process.stderr.write(
    "matrix: node_modules missing — run `npm install` in cli/matrix first (a chunky, isolated install)\n",
  );
  process.exit(1);
}

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

const posix = (p) => p.replace(/\\/g, "/");
const nm = (p) => posix(path.join(matrixDir, "node_modules", p));

const compilerOptions = (muiAlias) => ({
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  esModuleInterop: true,
  paths: {
    formstand: [posix(path.join(repoRoot, "src", "index.ts"))],
    zod: [nm("zod/index.d.ts")],
    react: [nm("@types/react")],
    "react/jsx-runtime": [nm("@types/react/jsx-runtime")],
    "@mui/material": [nm(muiAlias)],
  },
});

// The literal-attribute restatement of the adapter's TextField props style
// (see the header comment for why spreads alone can't catch this).
const probeSource = (usesSlotProps) =>
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

const generateVersion = (version) => {
  const dir = path.join(outRoot, `mui${version}`);
  const files = [];
  const write = (rel, content) => {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
    files.push(abs);
  };

  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(fixtureFile, path.join(dir, "boundarySchemas.ts"));

  const single = (formName, ir, name, visual) =>
    write(
      `single/${formName}.tsx`,
      api.emitMuiForm({
        ir,
        formName,
        muiVersion: version,
        schemaImport: { name, from: "../boundarySchemas", kind: "named" },
        ...(visual === undefined ? {} : { visual }),
      }),
    );

  // Single-file layout: the default chrome plus every non-default section
  // wrapper and grid (panel + 2 columns, collapsible + 3 columns).
  single("KitchenSinkForm", kitchenSinkIr, "kitchenSinkSchema");
  single("KitchenSinkPanel", kitchenSinkIr, "kitchenSinkSchema", {
    sections: "panel",
    columns: 2,
  });
  single("KitchenSinkCollapsible", kitchenSinkIr, "kitchenSinkSchema", {
    sections: "collapsible",
    columns: 3,
  });
  single("NestedArrayForm", nestedArrayIr, "nestedArrayStressSchema");

  // Module layout: the shared adapter file plus section/field files.
  const moduleForm = (folder, ir, name, formName, visual) =>
    api
      .emitModuleForm({
        ir,
        formName,
        muiVersion: version,
        ui: "mui",
        schemaImport: { name, from: "../../boundarySchemas", kind: "named" },
        ...(visual === undefined ? {} : { visual }),
      })
      .forEach((file) =>
        write(path.join("module", folder, file.path), file.content),
      );

  moduleForm("KitchenSink", kitchenSinkIr, "kitchenSinkSchema", "KitchenSinkForm", {
    sections: "collapsible",
    columns: 2,
  });
  moduleForm(
    "NestedArrays",
    nestedArrayIr,
    "nestedArrayStressSchema",
    "NestedArrayForm",
  );

  const adapter = fs.readFileSync(
    path.join(dir, "single", "KitchenSinkForm.tsx"),
    "utf8",
  );
  write("Probe.tsx", probeSource(adapter.includes("slotProps: {")));

  return files;
};

const formatDiagnostic = (d) => {
  const message = ts.flattenDiagnosticMessageText(d.messageText, " | ");
  if (d.file === undefined || d.start === undefined) return `TS${d.code} ${message}`;
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  return `${path.relative(matrixDir, d.file.fileName)}:${line + 1} TS${d.code} ${message}`;
};

fs.rmSync(outRoot, { recursive: true, force: true });

const results = api.MUI_VERSIONS.map((version) => {
  const files = generateVersion(version);
  const started = Date.now();
  const program = ts.createProgram(files, compilerOptions(`mui${version}`));
  const diagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ].map(formatDiagnostic);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  process.stderr.write(
    `mui@${version} (${files.length} files, ${seconds}s): ${
      diagnostics.length === 0 ? "clean" : `${diagnostics.length} diagnostics`
    }\n`,
  );
  diagnostics.forEach((d) => process.stderr.write(`  ${d}\n`));
  return diagnostics.length;
});

const failures = results.filter((count) => count > 0).length;
process.stderr.write(
  failures === 0
    ? `matrix: all ${results.length} supported @mui/material majors typecheck both layouts\n`
    : `matrix: ${failures} version(s) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
