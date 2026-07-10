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

// Visual layout of the generated markup (orthogonal to --layout, which is
// FILE layout): how sections wrap, and how many evenly spaced columns their
// fields flow into. Multi-row content (nested sections, array editors)
// always spans the full row.
export type VisualOptions = Readonly<{
  sections: "flat" | "panel" | "collapsible";
  columns: 1 | 2 | 3;
}>;

export const DEFAULT_VISUAL: VisualOptions = { sections: "flat", columns: 1 };

export type EmitFormOptions = Readonly<{
  ir: FieldSpec;
  formName: string;
  schemaImport: SchemaImport;
  visual?: VisualOptions;
}>;

export type ObjectSpec = Extract<FieldSpec, Readonly<{ kind: "object" }>>;

export const ind = (level: number): string => "  ".repeat(level);

// ---------------------------------------------------------------------------
// Escaping — one helper per emission context, so ANY field name is safe
// ---------------------------------------------------------------------------

// JS string literal (also the payload of JSX expression containers).
// JSON.stringify leaves U+2028/U+2029 raw — legal JSON, but a syntax error
// inside string literals for pre-ES2019 parsers of the GENERATED file (and
// CodeQL's js/bad-code-sanitization); escape them so emitted source is
// plain ASCII-safe line-wise.
export const q = (value: string): string =>
  JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
// "__proto__" must be a COMPUTED key: in an object literal both `__proto__:`
// and `"__proto__":` are the prototype setter (zero own keys), so the
// emitted schema shape and initialValues would silently drop the field.
const propKey = (name: string): string =>
  name === "__proto__"
    ? `["__proto__"]`
    : IDENT_RE.test(name)
      ? name
      : q(name);

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

// The ONE table of blank-form defaults: what a blank leaf holds, paired
// with whether that blank satisfies z.input. emitInitialValues and
// blankNeedsCast both read it, so the emitted expression and the
// annotate-vs-cast decision cannot drift apart — a disagreement would ship
// as a compile error in every user's generated file.
type BlankLeaf = Readonly<{ expr: string; satisfiesInput: boolean }>;

const blankLeaf = (
  spec: Extract<
    FieldSpec,
    Readonly<{ kind: "string" | "boolean" | "number" | "date" | "enum" }>
  >,
): BlankLeaf => {
  switch (spec.kind) {
    case "string":
      return spec.nullable
        ? { expr: "null", satisfiesInput: true }
        : spec.optional
          ? { expr: "undefined", satisfiesInput: true }
          : { expr: '""', satisfiesInput: true };
    case "boolean":
      return spec.nullable
        ? { expr: "null", satisfiesInput: true }
        : spec.optional
          ? { expr: "undefined", satisfiesInput: true }
          : { expr: "false", satisfiesInput: true };
    case "number":
    case "date":
    case "enum":
      // No blank literal exists for a required one — undefined is the only
      // honest start, and it doesn't satisfy the input type.
      return spec.nullable
        ? { expr: "null", satisfiesInput: true }
        : { expr: "undefined", satisfiesInput: spec.optional };
  }
};

// Blank-form defaults per blankLeaf; arrays start empty, and objects are
// always materialized (even optional ones) so their fields are addressable.
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
    default:
      return blankLeaf(spec).expr;
  }
};

// Whether the blank draft needs the as-unknown-as escape hatch: derived
// from the same blankLeaf table emitInitialValues emits from, so a checked
// type annotation is used exactly when the draft genuinely typechecks.
export const blankNeedsCast = (spec: FieldSpec): boolean => {
  switch (spec.kind) {
    case "object":
      return spec.fields.some((field) => blankNeedsCast(field.spec));
    case "array":
      return false;
    default:
      return !blankLeaf(spec).satisfiesInput;
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

export type KindUsage = Readonly<{
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

export const collectUsage = (spec: FieldSpec): KindUsage => {
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
    ...(blankNeedsCast(ir)
      ? [
          "// A form starts blank: required numbers/dates/enums begin undefined,",
          "// so these initial values intentionally do not satisfy the schema",
          "// yet; hence the cast. Validation reports the gaps on submit.",
          `const initialValues = ${emitInitialValues(ir, 0)} as unknown as FormValues;`,
        ]
      : [
          '// A form starts blank, and every field here has a legal blank state',
          '// (strings "", booleans false, optional/nullable undefined/null),',
          "// so the draft typechecks as-is; no cast needed.",
          `const initialValues: FormValues = ${emitInitialValues(ir, 0)};`,
        ]),
  ].join("\n");

const arrayItemDecls = (arrays: readonly ArrayEntry[]): string =>
  arrays
    .flatMap((entry) => [
      "",
      `type ${entry.itemTypeName} = ${entry.itemTypeExpr};`,
      "",
      blankNeedsCast(entry.item)
        ? `const ${entry.emptyItemName} = ${emitInitialValues(entry.item, 0)} as unknown as ${entry.itemTypeName};`
        : `const ${entry.emptyItemName}: ${entry.itemTypeName} = ${emitInitialValues(entry.item, 0)};`,
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

const plainBackend = (visual: VisualOptions): Backend => {
  const cols = visual.columns;
  // Section roots span the full row so nested sections inside a parent grid
  // never get squeezed into one column (harmless outside a grid).
  const span = cols > 1 ? `gridColumn: "1 / -1"` : "";
  const grid = cols > 1 ? gridStyleProps(cols) : "";
  const styleAttr = (...parts: readonly string[]): string => {
    const body = parts.filter((part) => part !== "").join(", ");
    return body === "" ? "" : ` style={{ ${body} }}`;
  };
  const panelChrome =
    visual.sections === "panel"
      ? `border: "1px solid #d0d7e2", borderRadius: 8, padding: 16, margin: 0`
      : "";

  return {
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
  objectSection: (label, level, body) =>
    visual.sections === "collapsible"
      ? [
          `${ind(level)}<details open${styleAttr(span)}>`,
          `${ind(level + 1)}<summary style={{ cursor: "pointer", fontWeight: 600 }}>${jsxText(label)}</summary>`,
          ...(cols > 1
            ? [
                `${ind(level + 1)}<div${styleAttr(grid)}>`,
                ...body,
                `${ind(level + 1)}</div>`,
              ]
            : body),
          `${ind(level)}</details>`,
        ]
      : [
          `${ind(level)}<fieldset${styleAttr(span, grid, panelChrome)}>`,
          `${ind(level + 1)}<legend${styleAttr(
            cols > 1 ? `gridColumn: "1 / -1"` : "",
            visual.sections === "panel" ? `padding: "0 6px", fontWeight: 600` : "",
          )}>${jsxText(label)}</legend>`,
          ...body,
          `${ind(level)}</fieldset>`,
        ],
  arraySection: (entry, level, rowBody) => [
    ...(visual.sections === "collapsible"
      ? [
          `${ind(level)}<details open${styleAttr(span)}>`,
          `${ind(level + 1)}<summary style={{ cursor: "pointer", fontWeight: 600 }}>${jsxText(entry.label)}</summary>`,
        ]
      : [
          `${ind(level)}<section${styleAttr(span, panelChrome)}>`,
          `${ind(level + 1)}<h3>${jsxText(entry.label)}</h3>`,
        ]),
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
    `${ind(level)}${visual.sections === "collapsible" ? "</details>" : "</section>"}`,
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
};

export const emitPlainForm = (options: EmitFormOptions): string =>
  emitForm(plainBackend(options.visual ?? DEFAULT_VISUAL), options);

// ---------------------------------------------------------------------------
// Snippets shared by the component-kit backends (MUI + shadcn)
// ---------------------------------------------------------------------------

// The grid each section's fields flow into, in each ui's dialect — emitted
// as PROPERTY/CLASS fragments (not whole objects) so wrappers can merge
// them with span and chrome styles. One source: the single-file backends
// and the module layout must emit identical grids for the same --columns.
export const gridStyleProps = (columns: number): string =>
  `display: "grid", gridTemplateColumns: "repeat(${columns}, minmax(0, 1fr))", gap: 16`;

export const gridSxProps = (columns: number): string =>
  `display: "grid", gridTemplateColumns: "repeat(${columns}, minmax(0, 1fr))", gap: 2`;

export const gridColsClass = (columns: number): string =>
  columns > 1 ? ` md:grid-cols-${columns}` : "";

export const hasLeafUsage = (usage: KindUsage): boolean =>
  usage.string || usage.date || usage.number || usage.boolean || usage.enum;

// Prefixes the top-level `const` declarations of an emitted block with
// "export " when the module layout writes them into a shared adapter file.
const withExportPrefix = (
  lines: readonly string[],
  exp: string,
): readonly string[] =>
  exp === ""
    ? lines
    : lines.map((line) =>
        line.startsWith("const ") ? `${exp}${line}` : line,
      );

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

export const muiAdapterSection = (usage: KindUsage, exp = ""): string => {
  const needsError = usage.string || usage.date || usage.number || usage.enum;
  const textAdapter = [
    "",
    `${exp}const muiTextFieldProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  error: fieldError(field) !== undefined,",
    "  helperText: fieldError(field),",
    "  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {",
    "    const text = e.target.value;",
    '    field.setValue((text === "" && field.emptyValue === null ? null : text) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  const numberAdapter = [
    "",
    `${exp}const muiNumberFieldProps = <T extends number | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    "  value: numberToInputText(field.value),",
    "  error: fieldError(field) !== undefined,",
    "  helperText: fieldError(field),",
    '  slotProps: { input: { inputMode: "decimal" as const } },',
    "  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {",
    "    const parsed = parseNumberText(e.target.value);",
    '    field.setValue((parsed.kind === "number" ? parsed.value : field.emptyValue) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  const selectAdapter = [
    "",
    `${exp}const muiSelectProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  error: fieldError(field) !== undefined,",
    "  helperText: fieldError(field),",
    "  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {",
    "    const next = e.target.value;",
    '    field.setValue((next === "" && field.emptyValue === null ? null : next) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  const switchAdapter = [
    "",
    `${exp}const muiSwitchProps = <T extends boolean | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    "  checked: field.value ?? false,",
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => field.setValue(e.target.checked as T),",
    "  onBlur: field.onBlur,",
    "});",
  ];
  return [
    "// ---- formstand → MUI adapter ----------------------------------------------",
    ...(needsError ? withExportPrefix(FIELD_ERROR_HELPER, exp) : []),
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

const muiBackend = (visual: VisualOptions): Backend => {
  const cols = visual.columns;
  // Every section container is a CSS grid (a one-column grid with gap: 2 is
  // exactly a Stack); section roots span the parent grid's full row.
  const gridSx = gridSxProps(cols);
  const span = cols > 1 ? `gridColumn: "1 / -1", ` : "";
  const sectionOpen = (label: string, level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        // The 1-column default keeps the historical Stack output verbatim.
        return cols === 1
          ? [
              `${ind(level)}<Stack spacing={2}>`,
              `${ind(level + 1)}<Typography variant="subtitle1">${jsxText(label)}</Typography>`,
            ]
          : [
              `${ind(level)}<Box sx={{ ${span}${gridSx} }}>`,
              `${ind(level + 1)}<Typography variant="subtitle1" sx={{ gridColumn: "1 / -1" }}>${jsxText(label)}</Typography>`,
            ];
      case "panel":
        // Same chrome shape as the module layout's objectShell (which puts
        // the heading INSIDE the grid CardContent so it can carry the
        // dirty/valid flags) — the two emitters must not drift for the
        // same --sections flag.
        return [
          `${ind(level)}<Card variant="outlined"${cols > 1 ? ` sx={{ gridColumn: "1 / -1" }}` : ""}>`,
          `${ind(level + 1)}<CardContent sx={{ ${gridSx} }}>`,
          `${ind(level + 2)}<Typography variant="subtitle1"${cols > 1 ? ` sx={{ gridColumn: "1 / -1" }}` : ""}>${jsxText(label)}</Typography>`,
        ];
      case "collapsible":
        return [
          `${ind(level)}<Accordion defaultExpanded variant="outlined" disableGutters${cols > 1 ? ` sx={{ gridColumn: "1 / -1" }}` : ""}>`,
          `${ind(level + 1)}<AccordionSummary expandIcon={<span aria-hidden>{"▾"}</span>}>`,
          `${ind(level + 2)}<Typography variant="subtitle1">${jsxText(label)}</Typography>`,
          `${ind(level + 1)}</AccordionSummary>`,
          `${ind(level + 1)}<AccordionDetails sx={{ ${gridSx} }}>`,
        ];
    }
  };
  const sectionClose = (level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        return [`${ind(level)}${cols === 1 ? "</Stack>" : "</Box>"}`];
      case "panel":
        return [`${ind(level + 1)}</CardContent>`, `${ind(level)}</Card>`];
      case "collapsible":
        return [
          `${ind(level + 1)}</AccordionDetails>`,
          `${ind(level)}</Accordion>`,
        ];
    }
  };

  return {
  header: (usage, arrays, root) => {
    const hasLeaf = hasLeafUsage(usage);
    const hasSection = arrays.length > 0 || anyAddressableObjectField(root);
    const muiImports = [
      ...(hasSection && visual.sections === "collapsible"
        ? ["Accordion", "AccordionDetails", "AccordionSummary"]
        : []),
      "Box",
      "Button",
      ...(hasSection && visual.sections === "panel"
        ? ["Card", "CardContent"]
        : []),
      ...(usage.boolean ? ["FormControlLabel"] : []),
      ...(usage.enum ? ["MenuItem"] : []),
      "Stack",
      ...(usage.boolean ? ["Switch"] : []),
      ...(usage.string || usage.date || usage.number || usage.enum
        ? ["TextField"]
        : []),
      ...(hasSection ? ["Typography"] : []),
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
    ...sectionOpen(label, level),
    ...body,
    ...sectionClose(level),
  ],
  arraySection: (entry, level, rowBody) => [
    ...sectionOpen(entry.label, level),
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
    ...sectionClose(level),
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
};

export const emitMuiForm = (options: EmitFormOptions): string =>
  emitForm(muiBackend(options.visual ?? DEFAULT_VISUAL), options);

// ---------------------------------------------------------------------------
// shadcn/ui backend
// ---------------------------------------------------------------------------

// Emits against the shadcn conventions: the components live in the consumer's
// app under the "@/components/ui/*" alias (what `npx shadcn add` scaffolds),
// validity surfaces as aria-invalid (the components style themselves off it)
// plus a message line, and the Radix-based widgets (Checkbox, Select) take
// value-first callbacks (onCheckedChange / onValueChange) instead of DOM
// change events.

export const shadcnAdapterSection = (usage: KindUsage, exp = ""): string => {
  const hasLeaf = hasLeafUsage(usage);
  const errorHelper = [
    ...FIELD_ERROR_HELPER,
    "",
    `${exp}const ariaInvalid = (`,
    "  field: Readonly<{ error: readonly string[] | undefined }>,",
    "): true | undefined => (fieldError(field) !== undefined ? true : undefined);",
    "",
    `${exp}const FieldError = ({`,
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
    `${exp}const shadcnTextInputProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    '  "aria-invalid": ariaInvalid(field),',
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => {",
    "    const text = e.target.value;",
    '    field.setValue((text === "" && field.emptyValue === null ? null : text) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  const numberAdapter = [
    "",
    `${exp}const shadcnNumberInputProps = <T extends number | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  type: "number" as const,',
    "  name: field.path,",
    "  value: numberToInputText(field.value),",
    '  "aria-invalid": ariaInvalid(field),',
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => {",
    "    const parsed = parseNumberText(e.target.value);",
    '    field.setValue((parsed.kind === "number" ? parsed.value : field.emptyValue) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // No blur event on the Radix Select root — closing the dropdown is the
  // "done editing" signal, so it maps to the field's blur trigger.
  const selectAdapter = [
    "",
    `${exp}const shadcnSelectProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  onValueChange: (value: string) => field.setValue(value as T),",
    "  onOpenChange: (open: boolean) => {",
    "    if (!open) field.onBlur();",
    "  },",
    "});",
  ];
  const checkboxAdapter = [
    "",
    `${exp}const shadcnCheckboxProps = <T extends boolean | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    "  checked: field.value ?? false,",
    '  "aria-invalid": ariaInvalid(field),',
    '  onCheckedChange: (checked: boolean | "indeterminate") =>',
    "    field.setValue((checked === true) as T),",
    "  onBlur: field.onBlur,",
    "});",
  ];
  return [
    "// ---- formstand → shadcn/ui adapter -----------------------------------------",
    ...(hasLeaf ? withExportPrefix(errorHelper, exp) : []),
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

const shadcnBackend = (visual: VisualOptions): Backend => {
  const cols = visual.columns;
  // md:col-span-full keeps nested sections on their own row inside a parent
  // grid (no effect when the parent stacks).
  const span = cols > 1 ? " md:col-span-full" : "";
  const colsClass = gridColsClass(cols);
  // shadcn's Card recipe, applied to the section wrapper itself.
  const panelChrome = " bg-card text-card-foreground shadow-sm";
  const sectionOpen = (label: string, level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
      case "panel":
        return [
          `${ind(level)}<fieldset className="grid gap-4 rounded-lg border p-4${visual.sections === "panel" ? panelChrome : ""}${colsClass}${span}">`,
          `${ind(level + 1)}<legend className="px-1 text-sm font-medium">${jsxText(label)}</legend>`,
        ];
      case "collapsible":
        return [
          `${ind(level)}<details open className="rounded-lg border${span}">`,
          `${ind(level + 1)}<summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">${jsxText(label)}</summary>`,
          `${ind(level + 1)}<div className="grid gap-4 px-4 pb-4${colsClass}">`,
        ];
    }
  };
  const sectionClose = (level: number): readonly string[] =>
    visual.sections === "collapsible"
      ? [`${ind(level + 1)}</div>`, `${ind(level)}</details>`]
      : [`${ind(level)}</fieldset>`];

  return {
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
    ...sectionOpen(label, level),
    ...body,
    ...sectionClose(level),
  ],
  arraySection: (entry, level, rowBody) => [
    ...(visual.sections === "collapsible"
      ? [
          `${ind(level)}<details open className="rounded-lg border${span}">`,
          `${ind(level + 1)}<summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">${jsxText(entry.label)}</summary>`,
          `${ind(level + 1)}<div className="grid gap-3 px-4 pb-4">`,
        ]
      : [
          `${ind(level)}<section className="grid gap-3${visual.sections === "panel" ? ` rounded-lg border p-4${panelChrome}` : ""}${span}">`,
          `${ind(level + 1)}<h3 className="text-sm font-medium">${jsxText(entry.label)}</h3>`,
        ]),
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
    ...(visual.sections === "collapsible"
      ? [`${ind(level + 1)}</div>`, `${ind(level)}</details>`]
      : [`${ind(level)}</section>`]),
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
};

export const emitShadcnForm = (options: EmitFormOptions): string =>
  emitForm(shadcnBackend(options.visual ?? DEFAULT_VISUAL), options);
