import { useState } from "react";
import {
  checkboxProps,
  selectProps,
  textInputProps,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";

// A formstand form that builds a formstand-gen command: the options are a
// zod schema (cross-field rule included — type mode needs a type name),
// and the command string is DERIVED state via useFormSelector, recomputed
// per keystroke and never stored.

const schema = z
  .object({
    runner: z.enum(["npx", "pnpm dlx", "yarn dlx"]),
    input: z.string().min(1, "point it at a schema or types file"),
    mode: z.enum(["zod", "type"]),
    exportName: z.string(),
    typeName: z.string(),
    ui: z.enum(["plain", "mui", "shadcn"]),
    layout: z.enum(["single", "module"]),
    sections: z.enum(["flat", "panel", "collapsible"]),
    columns: z.enum(["1", "2", "3"]),
    name: z.string(),
    out: z.string(),
    schemaOut: z.string(),
    force: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.mode === "type" && values.typeName.trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: "type mode needs an exported type name",
        path: ["typeName"],
      });
    }
  });

type Values = z.input<typeof schema>;

const quote = (arg: string): string =>
  /[\s"']/.test(arg) ? JSON.stringify(arg) : arg;

// Mirrors the CLI's actual flag semantics: defaults are omitted, --export
// only applies in zod mode, --type switches to type mode, and --schema-out
// only exists for type mode with the single-file layout (module layout puts
// the schema in the module's schema.ts).
const buildCommand = (values: Values): string =>
  [
    values.runner,
    "formstand-gen",
    quote(values.input.trim() === "" ? "<input.ts>" : values.input),
    ...(values.mode === "type" && values.typeName.trim() !== ""
      ? ["--type", quote(values.typeName)]
      : []),
    ...(values.mode === "zod" && values.exportName.trim() !== ""
      ? ["--export", quote(values.exportName)]
      : []),
    ...(values.ui !== "plain" ? ["--ui", values.ui] : []),
    ...(values.layout !== "single" ? ["--layout", values.layout] : []),
    ...(values.sections !== "flat" ? ["--sections", values.sections] : []),
    ...(values.columns !== "1" ? ["--columns", values.columns] : []),
    ...(values.name.trim() !== "" ? ["--name", quote(values.name)] : []),
    ...(values.out.trim() !== "" ? ["--out", quote(values.out)] : []),
    ...(values.mode === "type" &&
    values.layout === "single" &&
    values.schemaOut.trim() !== ""
      ? ["--schema-out", quote(values.schemaOut)]
      : []),
    ...(values.force ? ["--force"] : []),
  ].join(" ");

export const CliCommandBuilder = () => {
  const form = useForm(schema, {
    initialValues: {
      runner: "npx",
      input: "src/profileSchema.ts",
      mode: "zod",
      exportName: "",
      typeName: "",
      ui: "plain",
      layout: "single",
      sections: "flat",
      columns: "1",
      name: "",
      out: "src/ProfileForm.tsx",
      schemaOut: "",
      force: false,
    },
    mode: "onChange",
  });
  useDemoForm(form);
  const runner = useField(form, "runner");
  const input = useField(form, "input");
  const mode = useField(form, "mode");
  const exportName = useField(form, "exportName");
  const typeName = useField(form, "typeName");
  const ui = useField(form, "ui");
  const layout = useField(form, "layout");
  const sections = useField(form, "sections");
  const columns = useField(form, "columns");
  const name = useField(form, "name");
  const out = useField(form, "out");
  const schemaOut = useField(form, "schemaOut");
  const force = useField(form, "force");
  const [copied, setCopied] = useState(false);

  // The whole point: the command is computed from values, never stored.
  const command = useFormSelector(form, (state) => buildCommand(state.values));

  return (
    <div>
      <p className="subtitle-text" style={{ color: "#8b94a7", fontSize: 13, marginTop: 0 }}>
        Fill out the options and the <code>formstand-gen</code> command updates
        live — the command line is <code>useFormSelector</code> derived state,
        and "type mode needs a type name" is a cross-field{" "}
        <code>superRefine</code>.
      </p>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Runner</label>
          <select {...selectProps(runner)}>
            <option value="npx">npx</option>
            <option value="pnpm dlx">pnpm dlx</option>
            <option value="yarn dlx">yarn dlx</option>
          </select>
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>Input file</label>
          <input placeholder="src/schema.ts" {...textInputProps(input)} />
          <span className="error">{input.error?.[0] ?? " "}</span>
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Mode</label>
          <select {...selectProps(mode)}>
            <option value="zod">zod schema</option>
            <option value="type">TS type / interface</option>
          </select>
        </div>
        {mode.value === "type" ? (
          <div className="field" style={{ flex: 2 }}>
            <label>Type name (--type)</label>
            <input placeholder="Profile" {...textInputProps(typeName)} />
            <span className="error">{typeName.error?.[0] ?? " "}</span>
          </div>
        ) : (
          <div className="field" style={{ flex: 2 }}>
            <label>Schema export (--export, optional)</label>
            <input
              placeholder="default / sole export"
              {...textInputProps(exportName)}
            />
            <span className="error"> </span>
          </div>
        )}
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>UI library (--ui)</label>
          <select {...selectProps(ui)}>
            <option value="plain">plain (formstand components)</option>
            <option value="mui">mui (Material UI 9)</option>
            <option value="shadcn">shadcn (@/components/ui)</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Layout (--layout)</label>
          <select {...selectProps(layout)}>
            <option value="single">single file</option>
            <option value="module">feature module</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Sections (--sections)</label>
          <select {...selectProps(sections)}>
            <option value="flat">flat headings</option>
            <option value="panel">bordered panels</option>
            <option value="collapsible">collapsible</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Field columns (--columns)</label>
          <select {...selectProps(columns)}>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Component name (--name, optional)</label>
          <input placeholder="derived from input" {...textInputProps(name)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>
            {layout.value === "module"
              ? "Output folder (--out)"
              : "Output file (--out)"}
          </label>
          <input
            placeholder={
              layout.value === "module" ? "src/ProfileForm" : "stdout"
            }
            {...textInputProps(out)}
          />
        </div>
      </div>

      {mode.value === "type" && layout.value === "single" ? (
        <div className="field">
          <label>Generated schema file (--schema-out, optional)</label>
          <input
            placeholder="<schemaName>.ts next to --out"
            {...textInputProps(schemaOut)}
          />
        </div>
      ) : null}
      {mode.value === "type" && layout.value === "module" ? (
        <p style={{ color: "#8b94a7", fontSize: 12, margin: "0 0 12px" }}>
          Module layout writes the generated schema as the module's own{" "}
          <code>schema.ts</code>, so <code>--schema-out</code> doesn't apply.
        </p>
      ) : null}

      <div className="field">
        <label className="row" style={{ gap: 8 }}>
          <input {...checkboxProps(force)} />
          Overwrite existing files (--force)
        </label>
      </div>

      <div className="row" style={{ alignItems: "stretch", marginTop: 8 }}>
        <pre
          className="command-line"
          style={{ flex: 1, margin: 0, whiteSpace: "pre-wrap" }}
        >
          {command}
        </pre>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
};
