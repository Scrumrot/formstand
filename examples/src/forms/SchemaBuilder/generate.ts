// The in-browser half of formstand-gen: everything downstream of the CLI's
// IR is a pure string builder (no Node APIs), so the playground imports the
// REAL emitters straight from cli/src — same code that runs on npx, not a
// port. The builder form's values map directly onto FieldSpec, skipping the
// CLI's zod/TS parsing frontends entirely.
import { camelCase } from "../../../../cli/src/casing";
import {
  type EmitFormOptions,
  type VisualOptions,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
  emitZodSchema,
} from "../../../../cli/src/codegen";
import {
  type FieldSpec,
  type NamedField,
  labelFromName,
} from "../../../../cli/src/ir";
import {
  type ModuleFile,
  emitModuleForm,
} from "../../../../cli/src/moduleLayout";
import { type BuilderValues, parseEnumOptions } from "./builderSchema";

export type { ModuleFile };

type FieldRow = BuilderValues["rootFields"][number];

const rowSpec = (row: FieldRow): FieldSpec =>
  row.kind === "enum"
    ? {
        kind: "enum",
        options: parseEnumOptions(row.options),
        optional: row.optional,
        nullable: false,
      }
    : { kind: row.kind, optional: row.optional, nullable: false };

const named = (name: string, spec: FieldSpec): NamedField => ({
  name,
  label: labelFromName(name),
  spec,
});

const container = (fields: readonly NamedField[]): FieldSpec => ({
  kind: "object",
  optional: false,
  nullable: false,
  fields,
});

export const toIr = (values: BuilderValues): FieldSpec =>
  container([
    ...values.rootFields.map((row) => named(row.name, rowSpec(row))),
    ...values.sections.map((section) =>
      named(
        section.name,
        section.kind === "object"
          ? container(section.fields.map((row) => named(row.name, rowSpec(row))))
          : {
              kind: "array",
              optional: false,
              nullable: false,
              item: container(
                section.fields.map((row) => named(row.name, rowSpec(row))),
              ),
            },
      ),
    ),
  ]);

const emitComponent = (
  ui: BuilderValues["ui"],
  options: EmitFormOptions,
): string => {
  switch (ui) {
    case "mui":
      return emitMuiForm(options);
    case "shadcn":
      return emitShadcnForm(options);
    case "plain":
      return emitPlainForm(options);
  }
};

// Mirrors the CLI's type mode (the schema is generated, not imported): the
// module layout puts it in schema.ts, the single layout writes it alongside
// the component.
export const generateFiles = (
  values: BuilderValues,
): readonly ModuleFile[] => {
  const ir = toIr(values);
  const formName = values.formName;
  const stem = camelCase(formName.replace(/Form$/, ""));
  const schemaName = `${stem.length === 0 ? "form" : stem}Schema`;
  const visual: VisualOptions = {
    sections: values.sectionStyle,
    columns: Number(values.columns) as VisualOptions["columns"],
  };
  const schemaSource = emitZodSchema(ir, schemaName);
  return values.layout === "module"
    ? emitModuleForm({
        ir,
        formName,
        schemaImport: { name: schemaName, from: "./schema", kind: "named" },
        schemaSource,
        ui: values.ui,
        visual,
      })
    : [
        { path: `${schemaName}.ts`, content: schemaSource },
        {
          path: `${formName}.tsx`,
          content: emitComponent(values.ui, {
            ir,
            formName,
            schemaImport: {
              name: schemaName,
              from: `./${schemaName}`,
              kind: "named",
            },
            visual,
          }),
        },
      ];
};
