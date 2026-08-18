import { isReservedWord } from "./casing";

// The --wizard flow: the flag questions asked one at a time, ending with
// the composed formstand-gen command printed so the run is reproducible
// without the wizard. Three ground rules, from the roadmap:
//
// - Explicitly OPT-IN. Nothing here ever runs from a bare formstand-gen
//   or a TTY sniff — the CLI streams to stdout by default and must stay
//   scriptable; a prompt that appears when a pipe does not would break CI
//   and any agent driving the tool.
// - No prompts dependency. The CLI carries two dependencies (jiti,
//   typescript) on purpose; numbered lists over readline cover everything
//   arrow-key pickers would, and they work identically when stdin is a
//   pipe — which is also what makes the wizard testable.
// - Prompts write to STDERR (the caller wires io.say/io.ask there), so a
//   run that ends with stdout output keeps that stream clean for piping.
//
// Pure core, IO at the edge: the flow talks to a WizardIo the caller
// provides (readline in the CLI, a scripted fake in tests), and the
// answers compose to argv through composeWizardArgs — the same
// defaults-omitted semantics as the playground's CLI command builder.

export type WizardIo = Readonly<{
  // Ask one question; resolves with the raw line (Enter = "").
  ask: (prompt: string) => Promise<string>;
  // One line of guidance or feedback (stderr in the CLI).
  say: (line: string) => void;
  // fs.existsSync at the edge, injectable for tests.
  fileExists: (filePath: string) => boolean;
}>;

export type WizardAnswers = Readonly<{
  input: string;
  // "json" is never offered as a choice — a .json input file IS the mode
  // (the same extension dispatch the flag path uses), so the interview
  // detects it and swaps the zod/type questions for the --schema one.
  mode: "zod" | "type" | "json";
  exportName: string;
  typeName: string;
  schema: string;
  ui: string;
  layout: "single" | "module";
  sections: "flat" | "panel" | "collapsible";
  columns: "1" | "2" | "3";
  name: string;
  out: string;
  schemaOut: string;
  live: boolean;
  formProp: boolean;
  force: boolean;
}>;

export type WizardOutcome =
  | Readonly<{ kind: "run"; argv: readonly string[] }>
  | Readonly<{ kind: "printed"; argv: readonly string[] }>;

const quote = (arg: string): string =>
  /[\s"']/.test(arg) ? JSON.stringify(arg) : arg;

// Defaults are omitted, --export only applies in zod mode, --schema only
// in json mode, --schema-out only in the generated-schema modes (type and
// json) with the single-file layout — the exact rules the playground's
// command builder models (buildCommand in CliCommandBuilder.tsx); the two
// must not drift.
export const composeWizardArgs = (
  answers: WizardAnswers,
): readonly string[] => [
  answers.input,
  ...(answers.mode === "type" && answers.typeName !== ""
    ? ["--type", answers.typeName]
    : []),
  ...(answers.mode === "zod" && answers.exportName !== ""
    ? ["--export", answers.exportName]
    : []),
  ...(answers.mode === "json" && answers.schema !== ""
    ? ["--schema", answers.schema]
    : []),
  ...(answers.ui !== "plain" ? ["--ui", answers.ui] : []),
  ...(answers.layout !== "single" ? ["--layout", answers.layout] : []),
  ...(answers.sections !== "flat" ? ["--sections", answers.sections] : []),
  ...(answers.columns !== "1" ? ["--columns", answers.columns] : []),
  ...(answers.name !== "" ? ["--name", answers.name] : []),
  ...(answers.out !== "" ? ["--out", answers.out] : []),
  ...((answers.mode === "type" || answers.mode === "json") &&
  answers.layout === "single" &&
  answers.schemaOut !== ""
    ? ["--schema-out", answers.schemaOut]
    : []),
  ...(answers.live ? ["--live"] : []),
  ...(answers.formProp ? ["--form-prop"] : []),
  ...(answers.force ? ["--force"] : []),
];

export const composeWizardCommand = (answers: WizardAnswers): string =>
  ["formstand-gen", ...composeWizardArgs(answers).map(quote)].join(" ");

// ---------------------------------------------------------------------------
// Question primitives — each loops until it has a valid answer, so a typo
// re-asks instead of erroring out of a half-finished interview.
// ---------------------------------------------------------------------------

type Choice = Readonly<{ value: string; label: string }>;

const askText = async (
  io: WizardIo,
  prompt: string,
  fallback: string,
  // Expected failure is a return value: undefined accepts, a string is the
  // message to show before re-asking.
  validate: (value: string) => string | undefined = () => undefined,
): Promise<string> => {
  const hint = fallback === "" ? "" : ` [${fallback}]`;
  const raw = (await io.ask(`${prompt}${hint}: `)).trim();
  const value = raw === "" ? fallback : raw;
  const problem = validate(value);
  if (problem === undefined) return value;
  io.say(`  ${problem}`);
  return askText(io, prompt, fallback, validate);
};

const askChoice = async (
  io: WizardIo,
  prompt: string,
  choices: readonly Choice[],
  fallback: string,
): Promise<string> => {
  io.say(`${prompt}`);
  choices.forEach((choice, index) => {
    const mark = choice.value === fallback ? " (default)" : "";
    io.say(`  ${String(index + 1)}. ${choice.label}${mark}`);
  });
  const raw = (await io.ask(`Choose 1-${String(choices.length)} [${fallback}]: `)).trim();
  if (raw === "") return fallback;
  const byNumber = /^[0-9]+$/.test(raw) ? choices[Number(raw) - 1] : undefined;
  if (byNumber !== undefined) return byNumber.value;
  const byValue = choices.find((choice) => choice.value === raw);
  if (byValue !== undefined) return byValue.value;
  io.say(`  "${raw}" is not one of the options`);
  return askChoice(io, prompt, choices, fallback);
};

const askYesNo = async (
  io: WizardIo,
  prompt: string,
  fallback: boolean,
): Promise<boolean> => {
  const raw = (await io.ask(`${prompt} [${fallback ? "Y/n" : "y/N"}]: `))
    .trim()
    .toLowerCase();
  if (raw === "") return fallback;
  if (raw === "y" || raw === "yes") return true;
  if (raw === "n" || raw === "no") return false;
  io.say(`  answer y or n`);
  return askYesNo(io, prompt, fallback);
};

// ---------------------------------------------------------------------------
// The interview
// ---------------------------------------------------------------------------

const UI_CHOICES: readonly Choice[] = [
  { value: "plain", label: "plain — formstand's bundled components, dependency-free" },
  { value: "mui", label: "mui — Material UI, latest supported major" },
  { value: "mui@5", label: "mui@5" },
  { value: "mui@6", label: "mui@6" },
  { value: "mui@7", label: "mui@7" },
  { value: "mui@9", label: "mui@9" },
  { value: "shadcn", label: "shadcn — @/components/ui" },
  { value: "chakra", label: "chakra — Chakra UI 3" },
  { value: "mantine", label: "mantine — Mantine 9" },
  { value: "antd", label: "antd — Ant Design 6" },
];

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const askInput = async (io: WizardIo): Promise<string> => {
  const value = await askText(io, "Schema or types file", "", (candidate) =>
    candidate === ""
      ? "the input file is required"
      : /\.ya?ml$/i.test(candidate)
        ? "YAML is not supported yet — convert it to JSON first (e.g. npx js-yaml api.yaml > api.json)"
        : undefined,
  );
  if (io.fileExists(value)) return value;
  const anyway = await askYesNo(
    io,
    `"${value}" does not exist here — use it anyway`,
    false,
  );
  return anyway ? value : askInput(io);
};

// The output step owns the exists/overwrite loop: an existing target asks
// for --force, and declining re-asks for a different path instead of
// composing a command destined to fail.
const askOut = async (
  io: WizardIo,
  layout: "single" | "module",
): Promise<Readonly<{ out: string; force: boolean }>> => {
  const out = await askText(
    io,
    layout === "module"
      ? "Output folder (--out)"
      : "Output file (--out, Enter streams to stdout)",
    "",
    (candidate) =>
      layout === "module" && candidate === ""
        ? "the module layout writes a folder, so --out is required"
        : undefined,
  );
  if (out === "" || !io.fileExists(out)) return { out, force: false };
  const overwrite = await askYesNo(
    io,
    `"${out}" already exists — overwrite it (--force)`,
    false,
  );
  return overwrite ? { out, force: true } : askOut(io, layout);
};

export const runWizard = async (io: WizardIo): Promise<WizardOutcome> => {
  io.say("formstand-gen wizard — Enter accepts the [default] on any question.");
  io.say("");

  const input = await askInput(io);
  // A .json input IS the mode — asking "zod or type?" about a document
  // neither applies to would be a trick question.
  const jsonInput = /\.json$/i.test(input);
  if (jsonInput) {
    io.say("  .json input: generating from a JSON Schema / OpenAPI document.");
  }
  const mode = jsonInput
    ? "json"
    : ((await askChoice(
        io,
        "Where does the form's shape come from?",
        [
          { value: "zod", label: "a zod schema export" },
          { value: "type", label: "a TypeScript type or interface (--type)" },
        ],
        "zod",
      )) as WizardAnswers["mode"]);
  const exportName =
    mode === "zod"
      ? await askText(
          io,
          "Schema export (--export, Enter = default or sole export)",
          "",
        )
      : "";
  const typeName =
    mode === "type"
      ? await askText(io, "Exported type name (--type)", "", (candidate) =>
          candidate === "" ? "type mode needs an exported type name" : undefined,
        )
      : "";
  const schema =
    mode === "json"
      ? await askText(
          io,
          'Schema to generate (--schema: a component name or "#/..." pointer, Enter = the sole component schema)',
          "",
        )
      : "";
  const ui = await askChoice(io, "UI kit (--ui)?", UI_CHOICES, "plain");
  const layout = (await askChoice(
    io,
    "Layout (--layout)?",
    [
      { value: "single", label: "single — one component file" },
      { value: "module", label: "module — a feature-module folder (schema, hooks, fields, sections)" },
    ],
    "single",
  )) as WizardAnswers["layout"];
  const sections = (await askChoice(
    io,
    "Section chrome (--sections)?",
    [
      { value: "flat", label: "flat headings" },
      { value: "panel", label: "bordered panels" },
      { value: "collapsible", label: "collapsible sections" },
    ],
    "flat",
  )) as WizardAnswers["sections"];
  const columns = (await askChoice(
    io,
    "Field columns inside sections (--columns)?",
    [
      { value: "1", label: "1 — everything stacks" },
      { value: "2", label: "2 — two columns with room, one on a phone" },
      { value: "3", label: "3 — three columns with room, one on a phone" },
    ],
    "1",
  )) as WizardAnswers["columns"];
  const name = await askText(
    io,
    "Component name (--name, Enter derives it)",
    "",
    (candidate) =>
      candidate !== "" && (!IDENTIFIER.test(candidate) || isReservedWord(candidate))
        ? "the name must be a valid identifier (PascalCase recommended, e.g. ProfileForm)"
        : undefined,
  );
  const { out, force } = await askOut(io, layout);
  const schemaOut =
    (mode === "type" || mode === "json") && layout === "single"
      ? await askText(
          io,
          "Generated schema file (--schema-out, Enter puts it next to --out)",
          "",
        )
      : "";
  const live = await askYesNo(
    io,
    "Live mode — no submit scaffold, values stream to an onValuesChange prop (--live)",
    false,
  );
  const formProp = await askYesNo(
    io,
    "Page owns the form — component takes a form prop (--form-prop)",
    false,
  );

  const answers: WizardAnswers = {
    input,
    mode,
    exportName,
    typeName,
    schema,
    ui,
    layout,
    sections,
    columns,
    name,
    out,
    schemaOut,
    live,
    formProp,
    force,
  };
  const argv = composeWizardArgs(answers);
  io.say("");
  io.say("This run as a plain command (reproduces without the wizard):");
  io.say("");
  io.say(`  ${composeWizardCommand(answers)}`);
  io.say("");
  const runNow = await askYesNo(io, "Generate now", true);
  return runNow ? { kind: "run", argv } : { kind: "printed", argv };
};
