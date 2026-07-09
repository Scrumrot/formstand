import { pascalCase } from "./casing";
import { type FieldSpec, type NamedField, labelFromName } from "./ir";

// Code emitters: zod schema source, initial values, and the three component
// backends (plain HTML inputs bound via formstand's components; MUI v9 and
// shadcn/ui variants with inlined adapters). All backends share one IR walk
// and one form scaffold (emitForm); a Backend supplies the leaf renderers,
// section wrappers, and header imports, and the two kit backends also share
// their emitted snippets (fieldError helper, BoundFieldProps, the leaf
// switch). All emitters are pure string builders over the IR.

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

export type ObjectSpec = Extract<FieldSpec, Readonly<{ kind: "object" }>>;

export const ind = (level: number): string => "  ".repeat(level);

// ---------------------------------------------------------------------------
// Escaping — one helper per emission context, so ANY field name is safe
// ---------------------------------------------------------------------------

// JS string literal (also the payload of JSX expression containers).
export const q = (value: string): string => JSON.stringify(value);

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const propKey = (name: string): string =>
  IDENT_RE.test(name) ? name : q(name);

// JSX string attributes have no backslash escapes, so a quote in the value
// cannot be escaped in place. Every string-valued attribute is therefore
// emitted as an expression container holding a JS string: label={"..."}.
export const jsxAttr = (name: string, value: string): string => `${name}={${q(value)}}`;

// JSX text position: braces, angle brackets, and quotes are all significant
// there; a string expression container makes them inert.
export const jsxText = (value: string): string => `{${q(value)}}`;

// Static segment of a template literal: escape what is active inside
// backticks — backslashes, backticks, and "${" openings.
export const templateEscape = (value: string): string =>
  value.replace(/[\\`]|\$\{/g, (match) => `\\${match}`);

// Block-comment body: "*/" would end the comment early.
export const commentText = (value: string): string => value.replace(/\*\//g, "*\\/");

export const pascalJoin = (segments: readonly string[]): string =>
  segments.map(pascalCase).join("");

const camelJoin = (segments: readonly string[]): string => {
  const pascal = pascalJoin(segments);
  return pascal.length === 0
    ? pascal
    : pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

// formstand paths split on "." — a key containing one is not addressable, so
// the form emitters skip the binding (the zod schema and initialValues still
// carry the key).
export const isUnaddressable = (name: string): boolean => name.includes(".");

// The unaddressable field paths in an IR, for the CLI to surface as stderr
// warnings alongside the in-file TODO comments.
export const unaddressableFieldPaths = (ir: FieldSpec): readonly string[] => {
  const walk = (spec: FieldSpec, prefix: string): readonly string[] => {
    switch (spec.kind) {
      case "object":
        return spec.fields.flatMap((field) =>
          isUnaddressable(field.name)
            ? [`${prefix}${field.name}`]
            : walk(field.spec, `${prefix}${field.name}.`),
        );
      case "array":
        return walk(spec.item, prefix);
      default:
        return [];
    }
  };
  return walk(ir, "");
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

type RawArrayEntry = Readonly<{
  segments: readonly string[];
  label: string;
  item: FieldSpec;
}>;

const collectRawArrays = (
  spec: FieldSpec,
  segments: readonly string[],
  label: string,
): readonly RawArrayEntry[] => {
  switch (spec.kind) {
    case "object":
      return spec.fields
        .filter((field) => !isUnaddressable(field.name))
        .flatMap((field) =>
          collectRawArrays(field.spec, [...segments, field.name], field.label),
        );
    case "array":
      // Arrays nested inside this array's items have dynamic paths; they are
      // emitted as TODO comments instead of hooks.
      return [{ segments, label, item: spec.item }];
    default:
      return [];
  }
};

// Distinct source paths can normalize to the same Pascal identifier
// ("userNames" and "user_names"): disambiguate every derived identifier with
// a 2, 3, ... suffix (userNamesArray2, UserNamesItem2, emptyUserNamesItem2).
export const identifierSuffix = (base: string, used: ReadonlySet<string>): string => {
  const next = (n: number): string =>
    used.has(`${base}${n}`) ? next(n + 1) : `${n}`;
  return used.has(base) ? next(2) : "";
};

const arrayEntry = (raw: RawArrayEntry, suffix: string): ArrayEntry => {
  const pascal = pascalJoin(raw.segments);
  return {
    path: raw.segments.join("."),
    label: raw.label,
    item: raw.item,
    hookName: `${camelJoin(raw.segments)}Array${suffix}`,
    itemTypeName: `${pascal}Item${suffix}`,
    emptyItemName: `empty${pascal}Item${suffix}`,
    itemTypeExpr: `${raw.segments.reduce(
      (acc, segment) => `NonNullable<${acc}[${q(segment)}]>`,
      "FormValues",
    )}[number]`,
  };
};

const collectArrays = (root: ObjectSpec): readonly ArrayEntry[] =>
  collectRawArrays(root, [], "").reduce<
    Readonly<{ used: ReadonlySet<string>; entries: readonly ArrayEntry[] }>
  >(
    (acc, raw) => {
      const base = pascalJoin(raw.segments);
      const suffix = identifierSuffix(base, acc.used);
      return {
        used: new Set([...acc.used, `${base}${suffix}`]),
        entries: [...acc.entries, arrayEntry(raw, suffix)],
      };
    },
    { used: new Set<string>(), entries: [] },
  ).entries;

// A path prefix under construction. For dynamic prefixes (inside array rows)
// `text` is already template-escaped — apart from the deliberate ${index}
// hole — because it ends up inside a backtick template. Static prefixes stay
// raw and are JSON-escaped as one piece at the end.
type PathPrefix = Readonly<{ dynamic: boolean; text: string }>;

const extendPrefix = (prefix: PathPrefix, name: string): PathPrefix => ({
  dynamic: prefix.dynamic,
  text: `${prefix.text}${prefix.dynamic ? templateEscape(name) : name}.`,
});

const pathAttr = (prefix: PathPrefix, name: string): string => {
  const tail = prefix.dynamic ? templateEscape(name) : name;
  const full =
    name === "" ? prefix.text.replace(/\.$/, "") : prefix.text + tail;
  return prefix.dynamic ? `path={\`${full}\`}` : `path={${q(full)}}`;
};

const todoComment = (spec: FieldSpec, level: number): readonly string[] =>
  spec.todo !== undefined
    ? [`${ind(level)}{/* TODO: ${commentText(spec.todo)} */}`]
    : [];

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
        // No explicit item type: formstand >= 0.5 infers it from the typed
        // form + path (and the explicit generic errors on typed forms).
        `${ind(level)}const ${entry.hookName} = useFieldArray(form, ${q(entry.path)});`,
    )
    .join("\n");

const schemaImportLine = (schemaImport: SchemaImport): string =>
  schemaImport.kind === "default"
    ? `import ${schemaImport.name} from ${q(schemaImport.from)};`
    : `import { ${schemaImport.name} } from ${q(schemaImport.from)};`;

export const assertObjectRoot = (ir: FieldSpec): ObjectSpec => {
  if (ir.kind !== "object") {
    throw new Error("the root schema must be an object (z.object({...}))");
  }
  return ir;
};

// ---------------------------------------------------------------------------
// The shared walk + scaffold, parameterized by a Backend
// ---------------------------------------------------------------------------

type Backend = Readonly<{
  // Imports at the top of the file (everything before the schema import).
  header: (
    usage: KindUsage,
    arrays: readonly ArrayEntry[],
    root: ObjectSpec,
  ) => readonly string[];
  // Module-level sections between the array decls and the component.
  preamble: (usage: KindUsage) => readonly string[];
  // One bound control (or a todo fallback) for a scalar field.
  leaf: (
    spec: FieldSpec,
    attr: string,
    label: string,
    level: number,
  ) => readonly string[];
  // Wrapper around a nested object's fields.
  objectSection: (
    label: string,
    level: number,
    body: readonly string[],
  ) => readonly string[];
  // Wrapper around a field array's mapped rows (rowBody sits at level + 3).
  arraySection: (
    entry: ArrayEntry,
    level: number,
    rowBody: readonly string[],
  ) => readonly string[];
  // Indentation level of the top-level field list.
  bodyLevel: number;
  // JSX between "return (" and the field list / between the field list and ")".
  formOpen: readonly string[];
  formClose: readonly string[];
}>;

const fieldLines = (
  backend: Backend,
  fields: readonly NamedField[],
  prefix: PathPrefix,
  level: number,
  arrays: ReadonlyMap<string, ArrayEntry>,
): readonly string[] =>
  fields.flatMap((field): readonly string[] => {
    if (isUnaddressable(field.name)) {
      return [
        `${ind(level)}{/* TODO: field ${commentText(q(field.name))} skipped — "." in a key is not path-addressable (see formstand docs) */}`,
      ];
    }
    switch (field.spec.kind) {
      case "object":
        return [
          ...todoComment(field.spec, level),
          ...backend.objectSection(
            field.label,
            level,
            fieldLines(
              backend,
              field.spec.fields,
              extendPrefix(prefix, field.name),
              level + 1,
              arrays,
            ),
          ),
        ];
      case "array": {
        if (prefix.dynamic) {
          return [
            `${ind(level)}{/* TODO: nested array ${commentText(q(prefix.text + field.name))} inside an array row — extract a row component with its own useFieldArray */}`,
          ];
        }
        const entry = arrays.get(prefix.text + field.name);
        return entry === undefined
          ? []
          : arraySectionLines(backend, entry, level, arrays);
      }
      default:
        return backend.leaf(
          field.spec,
          pathAttr(prefix, field.name),
          field.label,
          level,
        );
    }
  });

const arraySectionLines = (
  backend: Backend,
  entry: ArrayEntry,
  level: number,
  arrays: ReadonlyMap<string, ArrayEntry>,
): readonly string[] => {
  const rowPrefix: PathPrefix = {
    dynamic: true,
    text: `${templateEscape(entry.path)}.\${index}.`,
  };
  const rowBody: readonly string[] =
    entry.item.kind === "object"
      ? fieldLines(backend, entry.item.fields, rowPrefix, level + 3, arrays)
      : backend.leaf(entry.item, pathAttr(rowPrefix, ""), entry.label, level + 3);
  return backend.arraySection(entry, level, rowBody);
};

const emitForm = (
  backend: Backend,
  { ir, formName, schemaImport }: EmitFormOptions,
): string => {
  const root = assertObjectRoot(ir);
  const usage = collectUsage(root);
  const arrays = collectArrays(root);
  const arrayMap: ReadonlyMap<string, ArrayEntry> = new Map(
    arrays.map((entry) => [entry.path, entry]),
  );
  return [
    "// Generated by formstand-cli — edit freely, this file is yours.",
    ...backend.header(usage, arrays, root),
    schemaImportLine(schemaImport),
    "",
    valuesTypeAndInitials(root, schemaImport.name),
    arrayItemDecls(arrays),
    "",
    ...backend.preamble(usage),
    `export const ${formName} = () => {`,
    `  const form = useForm(${schemaImport.name}, { initialValues, mode: "onBlur" });`,
    "  const submitting = useIsSubmitting(form);",
    ...(arrays.length > 0 ? [arrayHooks(arrays, 1)] : []),
    "",
    "  return (",
    ...backend.formOpen,
    ...fieldLines(
      backend,
      root.fields,
      { dynamic: false, text: "" },
      backend.bodyLevel,
      arrayMap,
    ),
    ...backend.formClose,
    "  );",
    "};",
    "",
  ].join("\n");
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
        `${ind(level)}<TextField form={form} ${attr} ${jsxAttr("label", label)} />`,
      ];
    case "date":
      return [
        ...todo,
        `${ind(level)}{/* TODO: date input — swap in a date picker; TextField binds plain text */}`,
        `${ind(level)}<TextField form={form} ${attr} ${jsxAttr("label", label)} />`,
      ];
    case "number":
      return [
        ...todo,
        `${ind(level)}<NumberField form={form} ${attr} ${jsxAttr("label", label)} />`,
      ];
    case "boolean":
      return [
        ...todo,
        `${ind(level)}<CheckboxField form={form} ${attr} ${jsxAttr("label", label)} />`,
      ];
    case "enum":
      return [
        ...todo,
        `${ind(level)}<SelectField`,
        `${ind(level + 1)}form={form}`,
        `${ind(level + 1)}${attr}`,
        `${ind(level + 1)}${jsxAttr("label", label)}`,
        `${ind(level + 1)}${jsxAttr("placeholder", `Select ${label.toLowerCase()}`)}`,
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

const plainBackend: Backend = {
  header: (usage, arrays) => {
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
      `import { z } from "zod";`,
      "import {",
      ...formstandImports.map((name) => `  ${name},`),
      `} from "formstand";`,
    ];
  },
  preamble: () => [],
  leaf: plainLeaf,
  objectSection: (label, level, body) => [
    `${ind(level)}<fieldset>`,
    `${ind(level + 1)}<legend>${jsxText(label)}</legend>`,
    ...body,
    `${ind(level)}</fieldset>`,
  ],
  arraySection: (entry, level, rowBody) => [
    `${ind(level)}<section>`,
    `${ind(level + 1)}<h3>${jsxText(entry.label)}</h3>`,
    `${ind(level + 1)}{${entry.hookName}.fields.map((row, index) => (`,
    `${ind(level + 2)}<fieldset key={row.id}>`,
    `${ind(level + 3)}<legend>${jsxText(`${entry.label} #`)}{index + 1}</legend>`,
    ...rowBody,
    `${ind(level + 3)}<button type="button" onClick={() => ${entry.hookName}.remove(index)}>`,
    `${ind(level + 4)}Remove`,
    `${ind(level + 3)}</button>`,
    `${ind(level + 2)}</fieldset>`,
    `${ind(level + 1)}))}`,
    `${ind(level + 1)}<button type="button" onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}>`,
    `${ind(level + 2)}${jsxText(`Add ${entry.label.toLowerCase()}`)}`,
    `${ind(level + 1)}</button>`,
    `${ind(level)}</section>`,
  ],
  bodyLevel: 3,
  formOpen: [
    "    <form",
    "      onSubmit={form.handleSubmit((data) => {",
    `        console.log("submit", data);`,
    "      })}",
    "    >",
  ],
  formClose: [
    `      <button type="submit" disabled={submitting}>`,
    `        {submitting ? "Submitting..." : "Submit"}`,
    "      </button>",
    "    </form>",
  ],
};

export const emitPlainForm = (options: EmitFormOptions): string =>
  emitForm(plainBackend, options);

// ---------------------------------------------------------------------------
// Snippets shared by the component-kit backends (MUI + shadcn)
// ---------------------------------------------------------------------------

const hasLeafUsage = (usage: KindUsage): boolean =>
  usage.string || usage.date || usage.number || usage.boolean || usage.enum;

// The emitted first-error helper — one definition so the two generators
// can't drift in error semantics.
const FIELD_ERROR_HELPER: readonly string[] = [
  "const fieldError = (",
  "  field: Readonly<{ error: readonly string[] | undefined }>,",
  "): string | undefined =>",
  "  field.error !== undefined && field.error.length > 0",
  "    ? field.error[0]",
  "    : undefined;",
];

// Gated like the components that use it: BoundFieldProps references
// FieldFormApi, whose import only exists when some leaf renders — an
// unconditional type would emit non-compiling code for leaf-free schemas.
const boundFieldProps = (usage: KindUsage): readonly string[] =>
  hasLeafUsage(usage)
    ? [
        "",
        "type BoundFieldProps = Readonly<{",
        "  form: FieldFormApi;",
        "  path: string;",
        "  label: string;",
        "}>;",
      ]
    : [];

// Both kit backends emit identical Bound* elements per leaf kind; they
// differ only in the date-picker TODO wording and which component binds a
// boolean (MUI renders a Switch, shadcn a Checkbox).
const boundLeaf =
  (dateTodo: string, booleanField: string): Backend["leaf"] =>
  (spec, attr, label, level) => {
    const todo = todoComment(spec, level);
    switch (spec.kind) {
      case "string":
        return [
          ...todo,
          `${ind(level)}<BoundTextField form={form} ${attr} ${jsxAttr("label", label)} />`,
        ];
      case "date":
        return [
          ...todo,
          `${ind(level)}{/* TODO: ${dateTodo} */}`,
          `${ind(level)}<BoundTextField form={form} ${attr} ${jsxAttr("label", label)} />`,
        ];
      case "number":
        return [
          ...todo,
          `${ind(level)}<BoundNumberField form={form} ${attr} ${jsxAttr("label", label)} />`,
        ];
      case "boolean":
        return [
          ...todo,
          `${ind(level)}<${booleanField} form={form} ${attr} ${jsxAttr("label", label)} />`,
        ];
      case "enum":
        return [
          ...todo,
          `${ind(level)}<BoundSelectField`,
          `${ind(level + 1)}form={form}`,
          `${ind(level + 1)}${attr}`,
          `${ind(level + 1)}${jsxAttr("label", label)}`,
          `${ind(level + 1)}options={[${spec.options.map(q).join(", ")}]}`,
          `${ind(level)}/>`,
        ];
      case "object":
      case "array":
        return [
          `${ind(level)}{/* unreachable: containers render elsewhere */}`,
        ];
    }
  };

// ---------------------------------------------------------------------------
// MUI backend (@mui/material v9)
// ---------------------------------------------------------------------------

// v9 rules baked in: slotProps.input (never InputProps), sx over system
// props, MenuItem children inside a select TextField. Layout uses Stack to
// stay out of Grid's way entirely.

const muiAdapterSection = (usage: KindUsage): string => {
  const needsError = usage.string || usage.date || usage.number || usage.enum;
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
    ...(needsError ? FIELD_ERROR_HELPER : []),
    ...(usage.string || usage.date ? textAdapter : []),
    ...(usage.number ? numberAdapter : []),
    ...(usage.enum ? selectAdapter : []),
    ...(usage.boolean ? switchAdapter : []),
  ].join("\n");
};

const muiBoundComponents = (usage: KindUsage): string => {
  const propsType = boundFieldProps(usage);
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

const muiLeaf = boundLeaf(
  "date input — consider @mui/x-date-pickers; this binds plain text",
  "BoundSwitchField",
);

// Typography renders section headings: any addressable object field at any
// depth needs it (array sections are covered by the arrays.length check).
const anyAddressableObjectField = (spec: FieldSpec): boolean => {
  switch (spec.kind) {
    case "object":
      return spec.fields.some(
        (field) =>
          !isUnaddressable(field.name) &&
          (field.spec.kind === "object" ||
            anyAddressableObjectField(field.spec)),
      );
    case "array":
      return anyAddressableObjectField(spec.item);
    default:
      return false;
  }
};

const muiBackend: Backend = {
  header: (usage, arrays, root) => {
    const hasLeaf = hasLeafUsage(usage);
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
      ...(arrays.length > 0 || anyAddressableObjectField(root)
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
      `import type { ChangeEvent } from "react";`,
      "import {",
      ...muiImports.map((name) => `  ${name},`),
      `} from "@mui/material";`,
      "import {",
      ...formstandValueImports.map((name) => `  ${name},`),
      ...formstandTypeImports.map((name) => `  type ${name},`),
      `} from "formstand";`,
      `import { z } from "zod";`,
    ];
  },
  preamble: (usage) => [
    muiAdapterSection(usage),
    muiBoundComponents(usage),
    "",
  ],
  leaf: muiLeaf,
  objectSection: (label, level, body) => [
    `${ind(level)}<Stack spacing={2}>`,
    `${ind(level + 1)}<Typography variant="subtitle1">${jsxText(label)}</Typography>`,
    ...body,
    `${ind(level)}</Stack>`,
  ],
  arraySection: (entry, level, rowBody) => [
    `${ind(level)}<Stack spacing={2}>`,
    `${ind(level + 1)}<Typography variant="subtitle1">${jsxText(entry.label)}</Typography>`,
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
    `${ind(level + 2)}${jsxText(`Add ${entry.label.toLowerCase()}`)}`,
    `${ind(level + 1)}</Button>`,
    `${ind(level)}</Stack>`,
  ],
  bodyLevel: 4,
  formOpen: [
    "    <Box",
    `      component="form"`,
    "      onSubmit={form.handleSubmit((data) => {",
    `        console.log("submit", data);`,
    "      })}",
    "      sx={{ maxWidth: 640 }}",
    "    >",
    "      <Stack spacing={2}>",
  ],
  formClose: [
    `        <Button type="submit" variant="contained" disabled={submitting}>`,
    `          {submitting ? "Submitting..." : "Submit"}`,
    "        </Button>",
    "      </Stack>",
    "    </Box>",
  ],
};

export const emitMuiForm = (options: EmitFormOptions): string =>
  emitForm(muiBackend, options);

// ---------------------------------------------------------------------------
// shadcn/ui backend
// ---------------------------------------------------------------------------

// Emits against the shadcn conventions: the components live in the consumer's
// app under the "@/components/ui/*" alias (what `npx shadcn add` scaffolds),
// validity surfaces as aria-invalid (the components style themselves off it)
// plus a message line, and the Radix-based widgets (Checkbox, Select) take
// value-first callbacks (onCheckedChange / onValueChange) instead of DOM
// change events.

const shadcnAdapterSection = (usage: KindUsage): string => {
  const hasLeaf = hasLeafUsage(usage);
  const errorHelper = [
    ...FIELD_ERROR_HELPER,
    "",
    "const ariaInvalid = (",
    "  field: Readonly<{ error: readonly string[] | undefined }>,",
    "): true | undefined => (fieldError(field) !== undefined ? true : undefined);",
    "",
    "const FieldError = ({",
    "  field,",
    "}: Readonly<{",
    "  field: Readonly<{ error: readonly string[] | undefined }>;",
    "}>) => {",
    "  const message = fieldError(field);",
    "  return message !== undefined ? (",
    '    <p className="text-sm text-destructive">{message}</p>',
    "  ) : null;",
    "};",
  ];
  const textAdapter = [
    "",
    "const shadcnTextInputProps = (field: UseFieldReturn<string | null | undefined>) => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    '  "aria-invalid": ariaInvalid(field),',
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => {",
    "    const text = e.target.value;",
    '    field.setValue(text === "" && field.emptyValue === null ? null : text);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  const numberAdapter = [
    "",
    "const shadcnNumberInputProps = (field: UseFieldReturn<number | null | undefined>) => ({",
    '  type: "number" as const,',
    "  name: field.path,",
    "  value: numberToInputText(field.value),",
    '  "aria-invalid": ariaInvalid(field),',
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => {",
    "    const parsed = parseNumberText(e.target.value);",
    '    field.setValue(parsed.kind === "number" ? parsed.value : field.emptyValue);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // No blur event on the Radix Select root — closing the dropdown is the
  // "done editing" signal, so it maps to the field's blur trigger.
  const selectAdapter = [
    "",
    "const shadcnSelectProps = (field: UseFieldReturn<string | null | undefined>) => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  onValueChange: (value: string) => field.setValue(value),",
    "  onOpenChange: (open: boolean) => {",
    "    if (!open) field.onBlur();",
    "  },",
    "});",
  ];
  const checkboxAdapter = [
    "",
    "const shadcnCheckboxProps = (field: UseFieldReturn<boolean | null | undefined>) => ({",
    "  name: field.path,",
    "  checked: field.value ?? false,",
    '  "aria-invalid": ariaInvalid(field),',
    '  onCheckedChange: (checked: boolean | "indeterminate") =>',
    "    field.setValue(checked === true),",
    "  onBlur: field.onBlur,",
    "});",
  ];
  return [
    "// ---- formstand → shadcn/ui adapter -----------------------------------------",
    ...(hasLeaf ? errorHelper : []),
    ...(usage.string || usage.date ? textAdapter : []),
    ...(usage.number ? numberAdapter : []),
    ...(usage.enum ? selectAdapter : []),
    ...(usage.boolean ? checkboxAdapter : []),
  ].join("\n");
};

const shadcnBoundComponents = (usage: KindUsage): string => {
  const propsType = boundFieldProps(usage);
  const text = [
    "",
    "const BoundTextField = ({ form, path, label }: BoundFieldProps) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    '    <div className="grid gap-2">',
    "      <Label htmlFor={path}>{label}</Label>",
    "      <Input id={path} {...shadcnTextInputProps(field)} />",
    "      <FieldError field={field} />",
    "    </div>",
    "  );",
    "};",
  ];
  const number = [
    "",
    "const BoundNumberField = ({ form, path, label }: BoundFieldProps) => {",
    "  const field = useField<number | null | undefined>(form, path);",
    "  return (",
    '    <div className="grid gap-2">',
    "      <Label htmlFor={path}>{label}</Label>",
    "      <Input id={path} {...shadcnNumberInputProps(field)} />",
    "      <FieldError field={field} />",
    "    </div>",
    "  );",
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
    '    <div className="grid gap-2">',
    "      <Label htmlFor={path}>{label}</Label>",
    "      <Select {...shadcnSelectProps(field)}>",
    "        <SelectTrigger",
    "          id={path}",
    '          className="w-full"',
    "          aria-invalid={ariaInvalid(field)}",
    "        >",
    "          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />",
    "        </SelectTrigger>",
    "        <SelectContent>",
    "          {options.map((option) => (",
    "            <SelectItem key={option} value={option}>",
    "              {option}",
    "            </SelectItem>",
    "          ))}",
    "        </SelectContent>",
    "      </Select>",
    "      <FieldError field={field} />",
    "    </div>",
    "  );",
    "};",
  ];
  const checkbox = [
    "",
    "const BoundCheckboxField = ({ form, path, label }: BoundFieldProps) => {",
    "  const field = useField<boolean | null | undefined>(form, path);",
    "  return (",
    '    <div className="grid gap-2">',
    '      <div className="flex items-center gap-2">',
    "        <Checkbox id={path} {...shadcnCheckboxProps(field)} />",
    "        <Label htmlFor={path}>{label}</Label>",
    "      </div>",
    "      <FieldError field={field} />",
    "    </div>",
    "  );",
    "};",
  ];
  return [
    ...propsType,
    ...(usage.string || usage.date ? text : []),
    ...(usage.number ? number : []),
    ...(usage.enum ? select : []),
    ...(usage.boolean ? checkbox : []),
  ].join("\n");
};

const shadcnLeaf = boundLeaf(
  "date input — consider shadcn's Calendar-in-Popover pattern; this binds plain text",
  "BoundCheckboxField",
);

const shadcnBackend: Backend = {
  header: (usage, arrays) => {
    const hasLeaf = hasLeafUsage(usage);
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
      ...(usage.string || usage.date || usage.number
        ? [`import type { ChangeEvent } from "react";`]
        : []),
      `import { Button } from "@/components/ui/button";`,
      ...(usage.boolean
        ? [`import { Checkbox } from "@/components/ui/checkbox";`]
        : []),
      ...(usage.string || usage.date || usage.number
        ? [`import { Input } from "@/components/ui/input";`]
        : []),
      ...(hasLeaf ? [`import { Label } from "@/components/ui/label";`] : []),
      ...(usage.enum
        ? [
            "import {",
            "  Select,",
            "  SelectContent,",
            "  SelectItem,",
            "  SelectTrigger,",
            "  SelectValue,",
            `} from "@/components/ui/select";`,
          ]
        : []),
      "import {",
      ...formstandValueImports.map((name) => `  ${name},`),
      ...formstandTypeImports.map((name) => `  type ${name},`),
      `} from "formstand";`,
      `import { z } from "zod";`,
    ];
  },
  preamble: (usage) => [
    shadcnAdapterSection(usage),
    shadcnBoundComponents(usage),
    "",
  ],
  leaf: shadcnLeaf,
  objectSection: (label, level, body) => [
    `${ind(level)}<fieldset className="grid gap-4 rounded-lg border p-4">`,
    `${ind(level + 1)}<legend className="px-1 text-sm font-medium">${jsxText(label)}</legend>`,
    ...body,
    `${ind(level)}</fieldset>`,
  ],
  arraySection: (entry, level, rowBody) => [
    `${ind(level)}<section className="grid gap-3">`,
    `${ind(level + 1)}<h3 className="text-sm font-medium">${jsxText(entry.label)}</h3>`,
    `${ind(level + 1)}{${entry.hookName}.fields.map((row, index) => (`,
    `${ind(level + 2)}<div key={row.id} className="grid gap-4 rounded-lg border p-4">`,
    ...rowBody,
    `${ind(level + 3)}<Button`,
    `${ind(level + 4)}type="button"`,
    `${ind(level + 4)}variant="outline"`,
    `${ind(level + 4)}size="sm"`,
    `${ind(level + 4)}className="w-fit"`,
    `${ind(level + 4)}onClick={() => ${entry.hookName}.remove(index)}`,
    `${ind(level + 3)}>`,
    `${ind(level + 4)}Remove`,
    `${ind(level + 3)}</Button>`,
    `${ind(level + 2)}</div>`,
    `${ind(level + 1)}))}`,
    `${ind(level + 1)}<Button`,
    `${ind(level + 2)}type="button"`,
    `${ind(level + 2)}variant="outline"`,
    `${ind(level + 2)}size="sm"`,
    `${ind(level + 2)}className="w-fit"`,
    `${ind(level + 2)}onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}`,
    `${ind(level + 1)}>`,
    `${ind(level + 2)}${jsxText(`Add ${entry.label.toLowerCase()}`)}`,
    `${ind(level + 1)}</Button>`,
    `${ind(level)}</section>`,
  ],
  bodyLevel: 3,
  formOpen: [
    "    <form",
    `      className="grid max-w-xl gap-4"`,
    "      onSubmit={form.handleSubmit((data) => {",
    `        console.log("submit", data);`,
    "      })}",
    "    >",
  ],
  formClose: [
    `      <Button type="submit" disabled={submitting}>`,
    `        {submitting ? "Submitting..." : "Submit"}`,
    "      </Button>",
    "    </form>",
  ],
};

export const emitShadcnForm = (options: EmitFormOptions): string =>
  emitForm(shadcnBackend, options);
