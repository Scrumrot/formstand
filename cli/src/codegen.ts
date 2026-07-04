import {
  type FieldSpec,
  type NamedField,
  labelFromName,
} from "./ir";

// Code emitters: zod schema source, initial values, and the two component
// backends (plain HTML inputs bound via formstand's components, and a MUI v9
// variant with an inlined adapter). All emitters are pure string builders
// over the IR.

export type SchemaImport = Readonly<{
  // Local identifier the generated component uses for the schema.
  name: string;
  // Module specifier to import it from (e.g. "./profileSchema").
  from: string;
  kind: "named" | "default";
}>;

export type EmitFormOptions = Readonly<{
  ir: FieldSpec;
  formName: string;
  schemaImport: SchemaImport;
}>;

const ind = (level: number): string => "  ".repeat(level);
const q = (value: string): string => JSON.stringify(value);

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const propKey = (name: string): string =>
  IDENT_RE.test(name) ? name : q(name);

const capitalize = (word: string): string =>
  word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);

const pascalJoin = (segments: readonly string[]): string =>
  segments
    .flatMap((segment) => segment.split(/[^A-Za-z0-9]+/))
    .filter((part) => part.length > 0)
    .map(capitalize)
    .join("");

const camelJoin = (segments: readonly string[]): string => {
  const pascal = pascalJoin(segments);
  return pascal.length === 0
    ? pascal
    : pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

// ---------------------------------------------------------------------------
// Initial values
// ---------------------------------------------------------------------------

// Blank-form defaults: strings start "", booleans false, numbers/dates/enums
// undefined, nullable scalars null, arrays empty. Objects are always
// materialized (even optional ones) so their fields are addressable.
export const emitInitialValues = (spec: FieldSpec, level = 0): string => {
  switch (spec.kind) {
    case "object": {
      const fields = spec.fields.map(
        (field) =>
          `${ind(level + 1)}${propKey(field.name)}: ${emitInitialValues(field.spec, level + 1)},`,
      );
      return fields.length === 0
        ? "{}"
        : `{\n${fields.join("\n")}\n${ind(level)}}`;
    }
    case "array":
      return "[]";
    case "string":
      return spec.nullable ? "null" : spec.optional ? "undefined" : '""';
    case "boolean":
      return spec.nullable ? "null" : spec.optional ? "undefined" : "false";
    case "number":
    case "date":
    case "enum":
      return spec.nullable ? "null" : "undefined";
  }
};

// ---------------------------------------------------------------------------
// Zod schema source (for type-mode users, and round-trippable from the IR)
// ---------------------------------------------------------------------------

const zodExpr = (spec: FieldSpec, level: number): string => {
  const base = ((): string => {
    switch (spec.kind) {
      case "string":
        return "z.string()";
      case "number":
        return "z.number()";
      case "boolean":
        return "z.boolean()";
      case "date":
        return "z.date()";
      case "enum":
        return `z.enum([${spec.options.map(q).join(", ")}])`;
      case "array":
        return `z.array(${zodExpr(spec.item, level)})`;
      case "object": {
        const fields = spec.fields.flatMap((field) => [
          ...(field.spec.todo !== undefined
            ? [`${ind(level + 1)}// TODO: ${field.spec.todo}`]
            : []),
          `${ind(level + 1)}${propKey(field.name)}: ${zodExpr(field.spec, level + 1)},`,
        ]);
        return fields.length === 0
          ? "z.object({})"
          : `z.object({\n${fields.join("\n")}\n${ind(level)}})`;
      }
    }
  })();
  const withNullable = spec.nullable ? `${base}.nullable()` : base;
  return spec.optional ? `${withNullable}.optional()` : withNullable;
};

export const emitZodSchema = (ir: FieldSpec, schemaName = "schema"): string =>
  [
    `import { z } from "zod";`,
    "",
    `export const ${schemaName} = ${zodExpr(ir, 0)};`,
    "",
  ].join("\n");

// ---------------------------------------------------------------------------
// Shared form-emission plumbing
// ---------------------------------------------------------------------------

type KindUsage = Readonly<{
  string: boolean;
  number: boolean;
  boolean: boolean;
  date: boolean;
  enum: boolean;
}>;

const NO_USAGE: KindUsage = {
  string: false,
  number: false,
  boolean: false,
  date: false,
  enum: false,
};

const mergeUsage = (a: KindUsage, b: KindUsage): KindUsage => ({
  string: a.string || b.string,
  number: a.number || b.number,
  boolean: a.boolean || b.boolean,
  date: a.date || b.date,
  enum: a.enum || b.enum,
});

const collectUsage = (spec: FieldSpec): KindUsage => {
  switch (spec.kind) {
    case "object":
      return spec.fields.reduce(
        (acc, field) => mergeUsage(acc, collectUsage(field.spec)),
        NO_USAGE,
      );
    case "array":
      return collectUsage(spec.item);
    default:
      return { ...NO_USAGE, [spec.kind]: true };
  }
};

// A field array the component can bind with a top-level useFieldArray hook —
// i.e. one whose path is static (not inside another array's rows).
type ArrayEntry = Readonly<{
  path: string;
  label: string;
  item: FieldSpec;
  hookName: string;
  itemTypeName: string;
  emptyItemName: string;
  itemTypeExpr: string;
}>;

const arrayEntry = (
  segments: readonly string[],
  label: string,
  item: FieldSpec,
): ArrayEntry => {
  const pascal = pascalJoin(segments);
  return {
    path: segments.join("."),
    label,
    item,
    hookName: `${camelJoin(segments)}Array`,
    itemTypeName: `${pascal}Item`,
    emptyItemName: `empty${pascal}Item`,
    itemTypeExpr: `${segments.reduce(
      (acc, segment) => `NonNullable<${acc}[${q(segment)}]>`,
      "FormValues",
    )}[number]`,
  };
};

const collectArrays = (
  spec: FieldSpec,
  segments: readonly string[],
  label: string,
): readonly ArrayEntry[] => {
  switch (spec.kind) {
    case "object":
      return spec.fields.flatMap((field) =>
        collectArrays(field.spec, [...segments, field.name], field.label),
      );
    case "array":
      // Arrays nested inside this array's items have dynamic paths; they are
      // emitted as TODO comments instead of hooks.
      return [arrayEntry(segments, label, spec.item)];
    default:
      return [];
  }
};

type PathPrefix = Readonly<{ dynamic: boolean; text: string }>;

const pathAttr = (prefix: PathPrefix, name: string): string => {
  const full = name === "" ? prefix.text.replace(/\.$/, "") : prefix.text + name;
  return prefix.dynamic ? "path={`" + full + "`}" : `path=${q(full)}`;
};

const todoComment = (spec: FieldSpec, level: number): readonly string[] =>
  spec.todo !== undefined ? [`${ind(level)}{/* TODO: ${spec.todo} */}`] : [];

const valuesTypeAndInitials = (ir: FieldSpec, schemaName: string): string =>
  [
    `type FormValues = z.input<typeof ${schemaName}>;`,
    "",
    "// A form starts blank: required numbers/dates/enums begin undefined, so",
    "// these initial values intentionally do not satisfy the schema yet —",
    "// hence the cast. Validation reports the gaps on submit.",
    `const initialValues = ${emitInitialValues(ir, 0)} as unknown as FormValues;`,
  ].join("\n");

const arrayItemDecls = (arrays: readonly ArrayEntry[]): string =>
  arrays
    .flatMap((entry) => [
      "",
      `type ${entry.itemTypeName} = ${entry.itemTypeExpr};`,
      "",
      `const ${entry.emptyItemName} = ${emitInitialValues(entry.item, 0)} as unknown as ${entry.itemTypeName};`,
    ])
    .join("\n");

const arrayHooks = (arrays: readonly ArrayEntry[], level: number): string =>
  arrays
    .map(
      (entry) =>
        `${ind(level)}const ${entry.hookName} = useFieldArray<${entry.itemTypeName}>(form, ${q(entry.path)});`,
    )
    .join("\n");

const schemaImportLine = (schemaImport: SchemaImport): string =>
  schemaImport.kind === "default"
    ? `import ${schemaImport.name} from ${q(schemaImport.from)};`
    : `import { ${schemaImport.name} } from ${q(schemaImport.from)};`;

const assertObjectRoot = (
  ir: FieldSpec,
): FieldSpec & Readonly<{ kind: "object" }> => {
  if (ir.kind !== "object") {
    throw new Error("the root schema must be an object (z.object({...}))");
  }
  return ir;
};

// ---------------------------------------------------------------------------
// Plain backend
// ---------------------------------------------------------------------------

const plainLeaf = (
  spec: FieldSpec,
  attr: string,
  label: string,
  level: number,
): readonly string[] => {
  const todo = todoComment(spec, level);
  switch (spec.kind) {
    case "string":
      return [
        ...todo,
        `${ind(level)}<TextField form={form} ${attr} label=${q(label)} />`,
      ];
    case "date":
      return [
        ...todo,
        `${ind(level)}{/* TODO: date input — swap in a date picker; TextField binds plain text */}`,
        `${ind(level)}<TextField form={form} ${attr} label=${q(label)} />`,
      ];
    case "number":
      return [
        ...todo,
        `${ind(level)}<NumberField form={form} ${attr} label=${q(label)} />`,
      ];
    case "boolean":
      return [
        ...todo,
        `${ind(level)}<CheckboxField form={form} ${attr} label=${q(label)} />`,
      ];
    case "enum":
      return [
        ...todo,
        `${ind(level)}<SelectField`,
        `${ind(level + 1)}form={form}`,
        `${ind(level + 1)}${attr}`,
        `${ind(level + 1)}label=${q(label)}`,
        `${ind(level + 1)}placeholder=${q(`Select ${label.toLowerCase()}`)}`,
        `${ind(level + 1)}options={[`,
        ...spec.options.map(
          (option) =>
            `${ind(level + 2)}{ value: ${q(option)}, label: ${q(labelFromName(option))} },`,
        ),
        `${ind(level + 1)}]}`,
        `${ind(level)}/>`,
      ];
    case "object":
    case "array":
      return [`${ind(level)}{/* unreachable: containers render elsewhere */}`];
  }
};

const plainArraySection = (
  entry: ArrayEntry,
  level: number,
  arrays: ReadonlyMap<string, ArrayEntry>,
): readonly string[] => {
  const rowPrefix: PathPrefix = {
    dynamic: true,
    text: entry.path + ".${index}.",
  };
  const rowBody: readonly string[] =
    entry.item.kind === "object"
      ? plainFields(entry.item.fields, rowPrefix, level + 3, arrays)
      : plainLeaf(entry.item, pathAttr(rowPrefix, ""), entry.label, level + 3);
  return [
    `${ind(level)}<section>`,
    `${ind(level + 1)}<h3>${entry.label}</h3>`,
    `${ind(level + 1)}{${entry.hookName}.fields.map((row, index) => (`,
    `${ind(level + 2)}<fieldset key={row.id}>`,
    `${ind(level + 3)}<legend>${entry.label} #{index + 1}</legend>`,
    ...rowBody,
    `${ind(level + 3)}<button type="button" onClick={() => ${entry.hookName}.remove(index)}>`,
    `${ind(level + 4)}Remove`,
    `${ind(level + 3)}</button>`,
    `${ind(level + 2)}</fieldset>`,
    `${ind(level + 1)}))}`,
    `${ind(level + 1)}<button type="button" onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}>`,
    `${ind(level + 2)}Add ${entry.label.toLowerCase()}`,
    `${ind(level + 1)}</button>`,
    `${ind(level)}</section>`,
  ];
};

const plainFields = (
  fields: readonly NamedField[],
  prefix: PathPrefix,
  level: number,
  arrays: ReadonlyMap<string, ArrayEntry>,
): readonly string[] =>
  fields.flatMap((field): readonly string[] => {
    switch (field.spec.kind) {
      case "object":
        return [
          ...todoComment(field.spec, level),
          `${ind(level)}<fieldset>`,
          `${ind(level + 1)}<legend>${field.label}</legend>`,
          ...plainFields(
            field.spec.fields,
            { dynamic: prefix.dynamic, text: `${prefix.text}${field.name}.` },
            level + 1,
            arrays,
          ),
          `${ind(level)}</fieldset>`,
        ];
      case "array": {
        if (prefix.dynamic) {
          return [
            `${ind(level)}{/* TODO: nested array "${prefix.text}${field.name}" inside an array row — extract a row component with its own useFieldArray */}`,
          ];
        }
        const entry = arrays.get(prefix.text + field.name);
        return entry === undefined
          ? []
          : plainArraySection(entry, level, arrays);
      }
      default:
        return plainLeaf(
          field.spec,
          pathAttr(prefix, field.name),
          field.label,
          level,
        );
    }
  });

export const emitPlainForm = ({
  ir,
  formName,
  schemaImport,
}: EmitFormOptions): string => {
  const root = assertObjectRoot(ir);
  const usage = collectUsage(root);
  const arrays = collectArrays(root, [], "");
  const arrayMap: ReadonlyMap<string, ArrayEntry> = new Map(
    arrays.map((entry) => [entry.path, entry]),
  );
  const formstandImports = [
    ...(usage.boolean ? ["CheckboxField"] : []),
    ...(usage.number ? ["NumberField"] : []),
    ...(usage.enum ? ["SelectField"] : []),
    ...(usage.string || usage.date ? ["TextField"] : []),
    ...(arrays.length > 0 ? ["useFieldArray"] : []),
    "useForm",
    "useIsSubmitting",
  ];
  return [
    "// Generated by formstand-cli — edit freely, this file is yours.",
    `import { z } from "zod";`,
    "import {",
    ...formstandImports.map((name) => `  ${name},`),
    `} from "formstand";`,
    schemaImportLine(schemaImport),
    "",
    valuesTypeAndInitials(root, schemaImport.name),
    arrayItemDecls(arrays),
    "",
    `export const ${formName} = () => {`,
    `  const form = useForm(${schemaImport.name}, { initialValues, mode: "onBlur" });`,
    "  const submitting = useIsSubmitting(form);",
    ...(arrays.length > 0 ? [arrayHooks(arrays, 1)] : []),
    "",
    "  return (",
    "    <form",
    "      onSubmit={form.handleSubmit((data) => {",
    `        console.log("submit", data);`,
    "      })}",
    "    >",
    ...plainFields(root.fields, { dynamic: false, text: "" }, 3, arrayMap),
    `      <button type="submit" disabled={submitting}>`,
    `        {submitting ? "Submitting..." : "Submit"}`,
    "      </button>",
    "    </form>",
    "  );",
    "};",
    "",
  ].join("\n");
};

// ---------------------------------------------------------------------------
// MUI backend (@mui/material v9)
// ---------------------------------------------------------------------------

// v9 rules baked in: slotProps.input (never InputProps), sx over system
// props, MenuItem children inside a select TextField. Layout uses Stack to
// stay out of Grid's way entirely.

const muiAdapterSection = (usage: KindUsage): string => {
  const needsError = usage.string || usage.date || usage.number || usage.enum;
  const errorHelper = [
    "const fieldError = (",
    "  field: Readonly<{ error: readonly string[] | undefined }>,",
    "): string | undefined =>",
    "  field.error !== undefined && field.error.length > 0",
    "    ? field.error[0]",
    "    : undefined;",
  ];
  const textAdapter = [
    "",
    "const muiTextFieldProps = (field: UseFieldReturn<string | null | undefined>) => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  error: fieldError(field) !== undefined,",
    "  helperText: fieldError(field),",
    "  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {",
    "    const text = e.target.value;",
    '    field.setValue(text === "" && field.emptyValue === null ? null : text);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  const numberAdapter = [
    "",
    "const muiNumberFieldProps = (field: UseFieldReturn<number | null | undefined>) => ({",
    "  name: field.path,",
    "  value: numberToInputText(field.value),",
    "  error: fieldError(field) !== undefined,",
    "  helperText: fieldError(field),",
    '  slotProps: { input: { inputMode: "decimal" as const } },',
    "  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {",
    "    const parsed = parseNumberText(e.target.value);",
    '    field.setValue(parsed.kind === "number" ? parsed.value : field.emptyValue);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  const selectAdapter = [
    "",
    "const muiSelectProps = (field: UseFieldReturn<string | null | undefined>) => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  error: fieldError(field) !== undefined,",
    "  helperText: fieldError(field),",
    "  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {",
    "    const next = e.target.value;",
    '    field.setValue(next === "" && field.emptyValue === null ? null : next);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  const switchAdapter = [
    "",
    "const muiSwitchProps = (field: UseFieldReturn<boolean | null | undefined>) => ({",
    "  name: field.path,",
    "  checked: field.value ?? false,",
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => field.setValue(e.target.checked),",
    "  onBlur: field.onBlur,",
    "});",
  ];
  return [
    "// ---- formstand → MUI adapter ----------------------------------------------",
    ...(needsError ? errorHelper : []),
    ...(usage.string || usage.date ? textAdapter : []),
    ...(usage.number ? numberAdapter : []),
    ...(usage.enum ? selectAdapter : []),
    ...(usage.boolean ? switchAdapter : []),
  ].join("\n");
};

const muiBoundComponents = (usage: KindUsage): string => {
  const propsType = [
    "",
    "type BoundFieldProps = Readonly<{",
    "  form: FieldFormApi;",
    "  path: string;",
    "  label: string;",
    "}>;",
  ];
  const text = [
    "",
    "const BoundTextField = ({ form, path, label }: BoundFieldProps) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return <TextField fullWidth label={label} {...muiTextFieldProps(field)} />;",
    "};",
  ];
  const number = [
    "",
    "const BoundNumberField = ({ form, path, label }: BoundFieldProps) => {",
    "  const field = useField<number | null | undefined>(form, path);",
    "  return <TextField fullWidth label={label} {...muiNumberFieldProps(field)} />;",
    "};",
  ];
  const select = [
    "",
    "const BoundSelectField = ({",
    "  form,",
    "  path,",
    "  label,",
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    "    <TextField select fullWidth label={label} {...muiSelectProps(field)}>",
    "      {options.map((option) => (",
    "        <MenuItem key={option} value={option}>",
    "          {option}",
    "        </MenuItem>",
    "      ))}",
    "    </TextField>",
    "  );",
    "};",
  ];
  const switchField = [
    "",
    "const BoundSwitchField = ({ form, path, label }: BoundFieldProps) => {",
    "  const field = useField<boolean | null | undefined>(form, path);",
    "  return (",
    "    <FormControlLabel",
    "      label={label}",
    "      control={<Switch {...muiSwitchProps(field)} />}",
    "    />",
    "  );",
    "};",
  ];
  return [
    ...propsType,
    ...(usage.string || usage.date ? text : []),
    ...(usage.number ? number : []),
    ...(usage.enum ? select : []),
    ...(usage.boolean ? switchField : []),
  ].join("\n");
};

const muiLeaf = (
  spec: FieldSpec,
  attr: string,
  label: string,
  level: number,
): readonly string[] => {
  const todo = todoComment(spec, level);
  switch (spec.kind) {
    case "string":
      return [
        ...todo,
        `${ind(level)}<BoundTextField form={form} ${attr} label=${q(label)} />`,
      ];
    case "date":
      return [
        ...todo,
        `${ind(level)}{/* TODO: date input — consider @mui/x-date-pickers; this binds plain text */}`,
        `${ind(level)}<BoundTextField form={form} ${attr} label=${q(label)} />`,
      ];
    case "number":
      return [
        ...todo,
        `${ind(level)}<BoundNumberField form={form} ${attr} label=${q(label)} />`,
      ];
    case "boolean":
      return [
        ...todo,
        `${ind(level)}<BoundSwitchField form={form} ${attr} label=${q(label)} />`,
      ];
    case "enum":
      return [
        ...todo,
        `${ind(level)}<BoundSelectField`,
        `${ind(level + 1)}form={form}`,
        `${ind(level + 1)}${attr}`,
        `${ind(level + 1)}label=${q(label)}`,
        `${ind(level + 1)}options={[${spec.options.map(q).join(", ")}]}`,
        `${ind(level)}/>`,
      ];
    case "object":
    case "array":
      return [`${ind(level)}{/* unreachable: containers render elsewhere */}`];
  }
};

const muiArraySection = (
  entry: ArrayEntry,
  level: number,
  arrays: ReadonlyMap<string, ArrayEntry>,
): readonly string[] => {
  const rowPrefix: PathPrefix = {
    dynamic: true,
    text: entry.path + ".${index}.",
  };
  const rowBody: readonly string[] =
    entry.item.kind === "object"
      ? muiFields(entry.item.fields, rowPrefix, level + 3, arrays)
      : muiLeaf(entry.item, pathAttr(rowPrefix, ""), entry.label, level + 3);
  return [
    `${ind(level)}<Stack spacing={2}>`,
    `${ind(level + 1)}<Typography variant="subtitle1">${entry.label}</Typography>`,
    `${ind(level + 1)}{${entry.hookName}.fields.map((row, index) => (`,
    `${ind(level + 2)}<Stack`,
    `${ind(level + 3)}key={row.id}`,
    `${ind(level + 3)}spacing={2}`,
    `${ind(level + 3)}sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}`,
    `${ind(level + 2)}>`,
    ...rowBody,
    `${ind(level + 3)}<Button type="button" onClick={() => ${entry.hookName}.remove(index)}>`,
    `${ind(level + 4)}Remove`,
    `${ind(level + 3)}</Button>`,
    `${ind(level + 2)}</Stack>`,
    `${ind(level + 1)}))}`,
    `${ind(level + 1)}<Button type="button" onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}>`,
    `${ind(level + 2)}Add ${entry.label.toLowerCase()}`,
    `${ind(level + 1)}</Button>`,
    `${ind(level)}</Stack>`,
  ];
};

const muiFields = (
  fields: readonly NamedField[],
  prefix: PathPrefix,
  level: number,
  arrays: ReadonlyMap<string, ArrayEntry>,
): readonly string[] =>
  fields.flatMap((field): readonly string[] => {
    switch (field.spec.kind) {
      case "object":
        return [
          ...todoComment(field.spec, level),
          `${ind(level)}<Stack spacing={2}>`,
          `${ind(level + 1)}<Typography variant="subtitle1">${field.label}</Typography>`,
          ...muiFields(
            field.spec.fields,
            { dynamic: prefix.dynamic, text: `${prefix.text}${field.name}.` },
            level + 1,
            arrays,
          ),
          `${ind(level)}</Stack>`,
        ];
      case "array": {
        if (prefix.dynamic) {
          return [
            `${ind(level)}{/* TODO: nested array "${prefix.text}${field.name}" inside an array row — extract a row component with its own useFieldArray */}`,
          ];
        }
        const entry = arrays.get(prefix.text + field.name);
        return entry === undefined ? [] : muiArraySection(entry, level, arrays);
      }
      default:
        return muiLeaf(
          field.spec,
          pathAttr(prefix, field.name),
          field.label,
          level,
        );
    }
  });

export const emitMuiForm = ({
  ir,
  formName,
  schemaImport,
}: EmitFormOptions): string => {
  const root = assertObjectRoot(ir);
  const usage = collectUsage(root);
  const arrays = collectArrays(root, [], "");
  const arrayMap: ReadonlyMap<string, ArrayEntry> = new Map(
    arrays.map((entry) => [entry.path, entry]),
  );
  const hasLeaf =
    usage.string || usage.number || usage.boolean || usage.date || usage.enum;
  const muiImports = [
    "Box",
    "Button",
    ...(usage.boolean ? ["FormControlLabel"] : []),
    ...(usage.enum ? ["MenuItem"] : []),
    "Stack",
    ...(usage.boolean ? ["Switch"] : []),
    ...(usage.string || usage.date || usage.number || usage.enum
      ? ["TextField"]
      : []),
    ...(arrays.length > 0 ||
    root.fields.some((field) => field.spec.kind === "object")
      ? ["Typography"]
      : []),
  ];
  const formstandValueImports = [
    ...(usage.number ? ["numberToInputText", "parseNumberText"] : []),
    ...(hasLeaf ? ["useField"] : []),
    ...(arrays.length > 0 ? ["useFieldArray"] : []),
    "useForm",
    "useIsSubmitting",
  ];
  const formstandTypeImports = [
    ...(hasLeaf ? ["FieldFormApi", "UseFieldReturn"] : []),
  ];
  return [
    "// Generated by formstand-cli — edit freely, this file is yours.",
    `import type { ChangeEvent } from "react";`,
    "import {",
    ...muiImports.map((name) => `  ${name},`),
    `} from "@mui/material";`,
    "import {",
    ...formstandValueImports.map((name) => `  ${name},`),
    ...formstandTypeImports.map((name) => `  type ${name},`),
    `} from "formstand";`,
    `import { z } from "zod";`,
    schemaImportLine(schemaImport),
    "",
    valuesTypeAndInitials(root, schemaImport.name),
    arrayItemDecls(arrays),
    "",
    muiAdapterSection(usage),
    muiBoundComponents(usage),
    "",
    `export const ${formName} = () => {`,
    `  const form = useForm(${schemaImport.name}, { initialValues, mode: "onBlur" });`,
    "  const submitting = useIsSubmitting(form);",
    ...(arrays.length > 0 ? [arrayHooks(arrays, 1)] : []),
    "",
    "  return (",
    "    <Box",
    `      component="form"`,
    "      onSubmit={form.handleSubmit((data) => {",
    `        console.log("submit", data);`,
    "      })}",
    "      sx={{ maxWidth: 640 }}",
    "    >",
    "      <Stack spacing={2}>",
    ...muiFields(root.fields, { dynamic: false, text: "" }, 4, arrayMap),
    `        <Button type="submit" variant="contained" disabled={submitting}>`,
    `          {submitting ? "Submitting..." : "Submit"}`,
    "        </Button>",
    "      </Stack>",
    "    </Box>",
    "  );",
    "};",
    "",
  ].join("\n");
};
