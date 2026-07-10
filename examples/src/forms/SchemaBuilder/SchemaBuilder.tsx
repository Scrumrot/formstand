import { useMemo, useState } from "react";
import {
  type Form,
  type UseFieldReturn,
  checkboxProps,
  selectProps,
  textInputProps,
  useField,
  useFieldArray,
  useForm,
  useFormSelector,
} from "formstand";
import { CodeView } from "../../demo/CodeView";
import { useDemoForm } from "../../demo/DemoShell";
import { FileTree } from "../../demo/FileTree";
import {
  FIELD_KINDS,
  blankField,
  blankSection,
  builderSchema,
  initialBuilderValues,
} from "./builderSchema";
import { generateFiles } from "./generate";
import { makeZip } from "./zip";

// formstand-gen, running in the browser: this form's values ARE the CLI's
// IR (see ./generate), so every keystroke re-runs the real emitters and the
// output below is exactly what `npx formstand-gen` would write to disk.

type BuilderForm = Form<typeof builderSchema>;

type FieldKind = (typeof FIELD_KINDS)[number];

const KIND_LABELS: Readonly<Record<FieldKind, string>> = {
  string: "text (string)",
  number: "number",
  boolean: "checkbox (boolean)",
  date: "date",
  enum: "select (enum)",
};

type MoveProps = Readonly<{
  onUp: () => void;
  onDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}>;

// Reordering is useFieldArray's move(): stable row IDs keep the inputs'
// state (and focus) with their row.
const MoveButtons = ({ onUp, onDown, isFirst, isLast }: MoveProps) => (
  <>
    <button
      className="secondary"
      type="button"
      onClick={onUp}
      disabled={isFirst}
      aria-label="move up"
    >
      ↑
    </button>
    <button
      className="secondary"
      type="button"
      onClick={onDown}
      disabled={isLast}
      aria-label="move down"
    >
      ↓
    </button>
  </>
);

type FieldRowInputsProps = MoveProps &
  Readonly<{
    name: UseFieldReturn<string>;
    kind: UseFieldReturn<FieldKind>;
    optional: UseFieldReturn<boolean>;
    options: UseFieldReturn<string>;
    onRemove: () => void;
  }>;

// One field row: name + kind + optional, with the enum-options input
// appearing only for selects (its "needs options" rule is a cross-field
// superRefine so the error lands right here).
const FieldRowInputs = ({
  name,
  kind,
  optional,
  options,
  onRemove,
  ...move
}: FieldRowInputsProps) => (
  <div className="row builder-field-row" style={{ alignItems: "flex-start" }}>
    <div className="field" style={{ flex: 2 }}>
      <input placeholder="fieldName" {...textInputProps(name)} />
      <span className="error">{name.error?.[0] ?? " "}</span>
    </div>
    <div className="field" style={{ flex: 2 }}>
      <select {...selectProps(kind)}>
        {FIELD_KINDS.map((value) => (
          <option key={value} value={value}>
            {KIND_LABELS[value]}
          </option>
        ))}
      </select>
      <span className="error"> </span>
    </div>
    {kind.value === "enum" ? (
      <div className="field" style={{ flex: 3 }}>
        <input placeholder="red, green, blue" {...textInputProps(options)} />
        <span className="error">{options.error?.[0] ?? " "}</span>
      </div>
    ) : null}
    <label className="row builder-optional" style={{ gap: 6 }}>
      <input {...checkboxProps(optional)} />
      optional
    </label>
    <MoveButtons {...move} />
    <button className="secondary" type="button" onClick={onRemove}>
      ✕
    </button>
  </div>
);

type RootFieldRowProps = MoveProps &
  Readonly<{
    form: BuilderForm;
    index: number;
    onRemove: () => void;
  }>;

const RootFieldRow = ({ form, index, onRemove, ...move }: RootFieldRowProps) => {
  const name = useField(form, `rootFields.${index}.name`);
  const kind = useField(form, `rootFields.${index}.kind`);
  const optional = useField(form, `rootFields.${index}.optional`);
  const options = useField(form, `rootFields.${index}.options`);
  return (
    <FieldRowInputs
      name={name}
      kind={kind}
      optional={optional}
      options={options}
      onRemove={onRemove}
      {...move}
    />
  );
};

type SectionFieldRowProps = MoveProps &
  Readonly<{
    form: BuilderForm;
    sectionIndex: number;
    index: number;
    onRemove: () => void;
  }>;

const SectionFieldRow = ({
  form,
  sectionIndex,
  index,
  onRemove,
  ...move
}: SectionFieldRowProps) => {
  const name = useField(form, `sections.${sectionIndex}.fields.${index}.name`);
  const kind = useField(form, `sections.${sectionIndex}.fields.${index}.kind`);
  const optional = useField(
    form,
    `sections.${sectionIndex}.fields.${index}.optional`,
  );
  const options = useField(
    form,
    `sections.${sectionIndex}.fields.${index}.options`,
  );
  return (
    <FieldRowInputs
      name={name}
      kind={kind}
      optional={optional}
      options={options}
      onRemove={onRemove}
      {...move}
    />
  );
};

type SectionEditorProps = MoveProps &
  Readonly<{
    form: BuilderForm;
    index: number;
    onRemove: () => void;
  }>;

const SectionEditor = ({ form, index, onRemove, ...move }: SectionEditorProps) => {
  const name = useField(form, `sections.${index}.name`);
  const kind = useField(form, `sections.${index}.kind`);
  const rows = useFieldArray(form, `sections.${index}.fields`);
  return (
    <div className="builder-section">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 2 }}>
          <input placeholder="sectionName" {...textInputProps(name)} />
          <span className="error">{name.error?.[0] ?? " "}</span>
        </div>
        <div className="field" style={{ flex: 2 }}>
          <select {...selectProps(kind)}>
            <option value="object">object — one group of fields</option>
            <option value="array">array — repeating rows</option>
          </select>
        </div>
        <MoveButtons {...move} />
        <button className="secondary" type="button" onClick={onRemove}>
          Remove section
        </button>
      </div>
      {rows.fields.map((row, fieldIndex) => (
        <SectionFieldRow
          key={row.id}
          form={form}
          sectionIndex={index}
          index={fieldIndex}
          onRemove={() => rows.remove(fieldIndex)}
          onUp={() => rows.move(fieldIndex, fieldIndex - 1)}
          onDown={() => rows.move(fieldIndex, fieldIndex + 1)}
          isFirst={fieldIndex === 0}
          isLast={fieldIndex === rows.fields.length - 1}
        />
      ))}
      <span className="error">{rows.error?.[0] ?? " "}</span>
      <button
        className="secondary"
        type="button"
        onClick={() => rows.push(blankField)}
      >
        + field
      </button>
    </div>
  );
};

// Re-emit on every change: the values snapshot is referentially stable, so
// the memo only re-runs the emitters when something was actually edited.
// Invalid drafts generate nothing (null) instead of broken code.
const useGeneratedFiles = (form: BuilderForm) => {
  const values = useFormSelector(form, (state) => state.values);
  return useMemo(() => {
    const parsed = builderSchema.safeParse(values);
    return parsed.success ? generateFiles(parsed.data) : null;
  }, [values]);
};

// Zip the files under a folder named for the component, so unzipping gives
// the same tree formstand-gen --out would have written.
const downloadZip = (
  formName: string,
  files: readonly Readonly<{ path: string; content: string }>[],
): void => {
  const bytes = makeZip(
    files.map((file) => ({
      path: `${formName}/${file.path}`,
      content: file.content,
    })),
  );
  // .buffer, not the view: TS's lib dts disagree across versions on whether
  // a Uint8Array is a BlobPart. makeZip's array is freshly allocated and
  // exactly sized, so its buffer IS the archive.
  const url = URL.createObjectURL(
    new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${formName}.zip`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const GeneratedOutput = ({ form }: Readonly<{ form: BuilderForm }>) => {
  const generated = useGeneratedFiles(form);
  const formName = useFormSelector(form, (state) => state.values.formName);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<"file" | null>(null);
  const files = generated ?? [];
  const demoFiles = useMemo(
    () => files.map((file) => ({ path: file.path, source: file.content })),
    [files],
  );
  const current =
    files.find((file) => file.path === selected) ??
    files.find((file) => file.path === "hooks.ts") ??
    files[0];

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied("file");
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="builder-output">
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Generated output</h3>
        {generated !== null && current !== undefined ? (
          <>
            <button
              className="secondary"
              type="button"
              onClick={() => copy(current.content)}
            >
              {copied === "file" ? "Copied!" : `Copy ${current.path}`}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => downloadZip(formName, files)}
            >
              Download .zip
            </button>
          </>
        ) : null}
      </div>
      {generated === null || current === undefined ? (
        <p className="error" style={{ marginTop: 8 }}>
          Fix the highlighted fields above and the files will regenerate.
        </p>
      ) : (
        <div className="code-panel builder-code">
          {files.length > 1 ? (
            <div className="code-tree">
              <FileTree
                files={demoFiles}
                selected={current.path}
                onSelect={setSelected}
              />
            </div>
          ) : null}
          <CodeView className="command-line code-view" source={current.content} />
        </div>
      )}
    </div>
  );
};

export const SchemaBuilder = () => {
  const form = useForm(builderSchema, {
    initialValues: initialBuilderValues,
    mode: "onChange",
  });
  useDemoForm(form);
  const formName = useField(form, "formName");
  const ui = useField(form, "ui");
  const layout = useField(form, "layout");
  const sectionStyle = useField(form, "sectionStyle");
  const columns = useField(form, "columns");
  const rootRows = useFieldArray(form, "rootFields");
  const sectionRows = useFieldArray(form, "sections");

  return (
    <div>
      <p className="subtitle-text" style={{ color: "#8b94a7", fontSize: 13, marginTop: 0 }}>
        Design a schema and the <strong>real formstand-gen emitters</strong>{" "}
        (imported from the CLI's source, running in your browser) regenerate
        the files on every keystroke — the same output <code>npx
        formstand-gen</code> writes to disk.
      </p>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 2 }}>
          <label>Component name</label>
          <input placeholder="ContactForm" {...textInputProps(formName)} />
          <span className="error">{formName.error?.[0] ?? " "}</span>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>UI (--ui)</label>
          <select {...selectProps(ui)}>
            <option value="plain">plain</option>
            <option value="mui">mui</option>
            <option value="shadcn">shadcn</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Layout (--layout)</label>
          <select {...selectProps(layout)}>
            <option value="single">single file</option>
            <option value="module">feature module</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Sections (--sections)</label>
          <select {...selectProps(sectionStyle)}>
            <option value="flat">flat</option>
            <option value="panel">panel</option>
            <option value="collapsible">collapsible</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Columns (--columns)</label>
          <select {...selectProps(columns)}>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>
      </div>

      <h3 style={{ marginBottom: 4 }}>Top-level fields</h3>
      {rootRows.fields.map((row, index) => (
        <RootFieldRow
          key={row.id}
          form={form}
          index={index}
          onRemove={() => rootRows.remove(index)}
          onUp={() => rootRows.move(index, index - 1)}
          onDown={() => rootRows.move(index, index + 1)}
          isFirst={index === 0}
          isLast={index === rootRows.fields.length - 1}
        />
      ))}
      <button
        className="secondary"
        type="button"
        onClick={() => rootRows.push(blankField)}
      >
        + field
      </button>

      <h3 style={{ marginBottom: 4 }}>Sections</h3>
      {sectionRows.fields.map((row, index) => (
        <SectionEditor
          key={row.id}
          form={form}
          index={index}
          onRemove={() => sectionRows.remove(index)}
          onUp={() => sectionRows.move(index, index - 1)}
          onDown={() => sectionRows.move(index, index + 1)}
          isFirst={index === 0}
          isLast={index === sectionRows.fields.length - 1}
        />
      ))}
      <button
        className="secondary"
        type="button"
        onClick={() => sectionRows.push(blankSection)}
      >
        + section
      </button>

      <GeneratedOutput form={form} />
    </div>
  );
};
