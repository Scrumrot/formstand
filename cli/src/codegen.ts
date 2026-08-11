import { pascalCase } from "./casing";
import {
  FORMSTAND_PATH_DEPTH,
  NESTING_LIMIT_TODO,
  isScalarSpec,
  overDepthBudget,
} from "./depth";
import { type FieldSpec, type NamedField, labelFromName } from "./ir";
import { type MuiVersion, DEFAULT_MUI_VERSION } from "./uiTarget";
import type {
  Template,
  TemplateImport,
  TemplateLeafContext,
  TemplateLeafKind,
} from "./template";

// Code emitters: zod schema source, initial values, and the component
// backends (plain HTML inputs bound via formstand's components; MUI,
// shadcn/ui, Chakra UI v3, Mantine 9, and Ant Design 6 variants with
// inlined adapters).
// All backends share one IR walk
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
  // Which @mui/material major the mui backend emits for (default: the
  // latest supported major). Ignored by every other backend.
  muiVersion?: MuiVersion;
  // --live: a form with no submit at all (a map or preview re-renders from
  // every value change). Omits the submit scaffold (handleSubmit, button,
  // useIsSubmitting), adds an optional onValuesChange prop wired through
  // form.watchValues, and defaults the emitted mode to "onChange".
  live?: boolean;
  // --form-prop: the page owns the form. The component takes a typed
  // `form` prop instead of calling useForm itself; the useForm scaffold is
  // still emitted, as an exported use{Name}Form hook the page calls.
  formProp?: boolean;
}>;

// The scaffold modes with their defaults applied — the shape the emitters
// and both layouts consume.
export type ScaffoldOptions = Readonly<{ live: boolean; formProp: boolean }>;

export const scaffoldOf = (
  options: Readonly<Pick<EmitFormOptions, "live" | "formProp">>,
): ScaffoldOptions => ({
  live: options.live === true,
  formProp: options.formProp === true,
});

// The emitted useForm/createForm mode. --live defaults it to "onChange":
// with the library-default "onBlur" a live consumer would read values whose
// errors lag a blur behind — a footgun for exactly the use case --live
// exists for (live coordinates driving a map want live validity too).
export const emittedMode = (scaffold: ScaffoldOptions): string =>
  scaffold.live ? "onChange" : "onBlur";

// The onSubmit attribute lines both layouts emit at the shell's attribute
// indent (6 spaces in every backend). Submit scaffolds run the typed
// handleSubmit; --live keeps the <form> element for its semantics (label
// association, the form landmark, kit styling props unchanged) but must
// still swallow the browser's implicit Enter-key submission — with no
// submit button a lone text input would otherwise navigate the page.
export const onSubmitAttrLines = (
  formExpr: string,
  live: boolean,
): readonly string[] =>
  live
    ? [
        "      onSubmit={(event) => {",
        "        // --live: no submit. preventDefault stops the browser's",
        "        // implicit Enter-key submission (a full page navigation);",
        "        // values flow through onValuesChange instead.",
        "        event.preventDefault();",
        "      }}",
      ]
    : [
        `      onSubmit={${formExpr}.handleSubmit((data) => {`,
        `        console.log("submit", data);`,
        "      })}",
      ];

// "ProfileForm" -> "useProfileForm": the exported owner hook --form-prop
// emits in place of the in-component useForm call (mirrors the module
// layout's prefix derivation: strip one trailing "Form").
const ownerHookName = (formName: string): string => {
  const stripped = formName.replace(/Form$/, "");
  return `use${stripped.length === 0 ? formName : stripped}Form`;
};

export type ObjectSpec = Extract<FieldSpec, Readonly<{ kind: "object" }>>;

export const ind = (level: number): string => "  ".repeat(level);

// Re-indent an already-built JSX block by whole levels. Section bodies are
// generated one level below their section tag (fieldLines' contract, which
// cannot know the kit's chrome), but panel/collapsible chrome nests the
// body's real container deeper — the shift is what parks cells under their
// container instead of under the Card. Safe on generated lines only: every
// line is space-prefixed code, so prefixing more spaces never changes
// meaning (multi-line string literals would break, and no emitter produces
// them).
export const shiftLines = (
  lines: readonly string[],
  delta: number,
): readonly string[] =>
  delta === 0
    ? lines
    : lines.map((line) => (line.length === 0 ? line : ind(delta) + line));

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

// The budget and its boundary predicates live in ./depth (shared with the
// schema walkers); re-exported here for the CLI, the module layout, and
// programmatic consumers.
export {
  FORMSTAND_PATH_DEPTH,
  NESTING_LIMIT_TODO,
  isScalarSpec,
  overDepthBudget,
} from "./depth";

// Segments of a bound path, counted the way the library splits paths: on
// ".", with each template hole (`${index}`, `${p0}`, ...) one numeric
// segment. Works on static paths and backtick templates alike.
//
// The hole body excludes BOTH braces, not just the closing one. A hole is
// always a plain identifier, so `[^{}]` costs nothing on real paths, and it
// keeps the scan linear: with `[^}]` an unterminated run like "${{${{${{..."
// rescans to end-of-string from every "${", which is quadratic (CodeQL
// js/polynomial-redos). This is a library entry point, and the emitters run
// in the browser via formstand-cli/codegen, so the input is not ours.
export const pathSegmentCount = (path: string): number =>
  path
    .replace(/\$\{[^{}]*\}/g, "0")
    .split(".")
    .filter((segment) => segment.length > 0).length;

// The shared TODO text for an over-budget binding — the emitters put it in a
// comment, the CLI mirrors it as a stderr warning (overBudgetFieldPaths).
export const depthTodoText = (path: string): string =>
  `path ${commentText(q(path))} exceeds formstand's typed FieldPath depth (${FORMSTAND_PATH_DEPTH}); bind by hand`;

// The one production of an over-budget TODO comment line, shared with the
// module layout so the two emitters can't drift on the wording.
export const depthTodoLine = (path: string, indent: string): string =>
  `${indent}{/* TODO: ${depthTodoText(path)} */}`;

// Where a LAYOUT's emitter stops descending — the degradation frontier. The
// two layouts genuinely diverge past it (each degrades the shape to a
// GENERIC extract/bind-by-hand TODO, not a depth TODO), so the depth-warning
// walk below must stop exactly where the chosen layout's emitter stops or
// the warnings promise depth TODOs the file doesn't contain.
export type DepthWarningFrontier = Readonly<{
  // Does the emitter descend into an array item that is ITSELF a container
  // (an array-of-arrays)? The module layout extracts an inner Rows component
  // (emitting depth TODOs inside it); the single-file layout degrades the
  // whole item to the generic extract-a-row TODO.
  descendsArrayItemContainers: boolean;
  // Does the emitter recurse into an OBJECT field of an array row? The
  // single-file layout lays row-object fields out inline (nested objects
  // included); the module layout degrades non-scalar, non-array row fields
  // to a generic bind-by-hand TODO.
  descendsRowObjects: boolean;
}>;

export const depthWarningFrontier = (
  layout: "single" | "module",
): DepthWarningFrontier =>
  layout === "module"
    ? { descendsArrayItemContainers: true, descendsRowObjects: false }
    : { descendsArrayItemContainers: false, descendsRowObjects: true };

// The over-budget paths in an IR, mirroring the emitters' boundary decisions
// through the SAME overDepthBudget predicate the walkers consult — one entry
// per depth-TODO site the CHOSEN layout emits (default: the single-file
// layout), not per buried leaf. An object stops recursion once
// overDepthBudget says its children can only exceed; an array level spends
// TWO segments (name + row index, shown as `*`). An array's OBJECT item
// never checks its own row path — the emitters walk straight into its
// fields (one TODO per field), so the warnings are per-field too; every
// other item kind checks the row path itself. Past the frontier the walk
// stops (the emitter degraded the shape to a generic TODO there, so a depth
// warning would over-promise). The CLI surfaces these as stderr warnings
// alongside the in-file TODO comments.
export const overBudgetFieldPaths = (
  ir: FieldSpec,
  frontier: DepthWarningFrontier = depthWarningFrontier("single"),
): readonly string[] => {
  const walkFields = (
    fields: readonly NamedField[],
    segments: readonly string[],
    rowFields: boolean,
  ): readonly string[] =>
    fields
      .filter((field) => !isUnaddressable(field.name))
      .flatMap((field) =>
        walk(field.spec, [...segments, field.name], rowFields),
      );
  const walk = (
    spec: FieldSpec,
    segments: readonly string[],
    rowField: boolean,
  ): readonly string[] => {
    if (overDepthBudget(spec, segments.length)) return [segments.join(".")];
    switch (spec.kind) {
      case "object":
        // An in-budget object field of an array row: only recurse when the
        // layout's emitter does (the module layout degrades it instead).
        return rowField && !frontier.descendsRowObjects
          ? []
          : walkFields(spec.fields, segments, false);
      case "array": {
        const row = [...segments, "*"];
        if (spec.item.kind === "object") {
          return walkFields(spec.item.fields, row, true);
        }
        // Both layouts check the row path itself for every non-object item…
        if (overDepthBudget(spec.item, row.length)) return [row.join(".")];
        // …but only the module layout descends into a container item.
        return frontier.descendsArrayItemContainers
          ? walk(spec.item, row, false)
          : [];
      }
      default:
        return [];
    }
  };
  return walk(ir, [], false);
};

// Every path in the IR whose spec matches `match`, "*" marking array rows,
// tuple elements at their numeric index, union variant fields under the
// union's path. Unlike overBudgetFieldPaths this walk descends EVERYWHERE —
// it reports facts about the IR itself (truncation, dropped defaults), not
// emitter decisions, so no frontier applies. The root is skipped (it has no
// path to name).
const matchingSpecPaths = (
  ir: FieldSpec,
  match: (spec: FieldSpec) => boolean,
): readonly string[] => {
  const walk = (
    spec: FieldSpec,
    segments: readonly string[],
  ): readonly string[] => [
    ...(segments.length > 0 && match(spec) ? [segments.join(".")] : []),
    ...((): readonly string[] => {
      switch (spec.kind) {
        case "object":
          return spec.fields.flatMap((field) =>
            walk(field.spec, [...segments, field.name]),
          );
        case "array":
          return walk(spec.item, [...segments, "*"]);
        case "tuple":
          return spec.elements.flatMap((element, i) =>
            walk(element, [...segments, String(i)]),
          );
        case "union":
          return spec.variants.flatMap((variant) =>
            variant.fields.flatMap((field) =>
              walk(field.spec, [...segments, field.name]),
            ),
          );
        default:
          return [];
      }
    })(),
  ];
  return walk(ir, []);
};

// The paths the WALKER truncated (nesting budget exhausted before the leaf
// was reached): their specs are string-kind stand-ins whose kind and flags
// may be wrong, so blankNeedsCast forces the initialValues cast and the CLI
// mirrors each one as its own stderr warning — truncation is never silent.
export const truncatedFieldPaths = (ir: FieldSpec): readonly string[] =>
  matchingSpecPaths(ir, (spec) => spec.todo === NESTING_LIMIT_TODO);

// The paths whose `.default()` / `.prefault()` value will NOT be seeded into
// the generated initialValues: the capture guard refused it in the walk
// (droppedDefault — function-valued, non-deterministic, throwing getter), or
// the emitter refuses the captured value (defaultLiteral: todo fallback,
// kind mismatch, non-finite number, undeclared enum option, any date). The
// CLI mirrors each as a stderr warning; fields with no default never appear.
export const droppedDefaultFieldPaths = (ir: FieldSpec): readonly string[] =>
  matchingSpecPaths(
    ir,
    (spec) =>
      spec.droppedDefault === true ||
      (spec.defaultValue !== undefined &&
        isScalarSpec(spec) &&
        defaultLiteral(spec as ScalarSpec) === undefined),
  );

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

type ScalarSpec = Extract<
  FieldSpec,
  Readonly<{ kind: "string" | "boolean" | "number" | "date" | "enum" }>
>;

// The `.default()` literal for a leaf, emitted only when the captured value
// is a JSON-serializable primitive MATCHING the field kind (a string, a
// finite number, a boolean, or a declared enum option). Dates and container
// defaults have no safe source literal, and a mismatched value would emit a
// type error — both degrade to the blank behavior below.
const defaultLiteral = (spec: ScalarSpec): string | undefined => {
  // A fallback stand-in (todo set) LIES about the kind: z.custom<T>()
  // degrades to a string spec, so a captured `.default("abc")` would seed a
  // plain string literal into a slot whose real z.input type is T — breaking
  // the generated file's checked initialValues annotation (verified with
  // z.custom<Branded>().default(...)). Never seed a default into a fallback;
  // the field keeps its blank/undefined behavior.
  if (spec.todo !== undefined) return undefined;
  const value = spec.defaultValue;
  switch (spec.kind) {
    case "string":
      return typeof value === "string" ? q(value) : undefined;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? JSON.stringify(value)
        : undefined;
    case "boolean":
      return typeof value === "boolean" ? String(value) : undefined;
    case "enum":
      return typeof value === "string" && spec.options.includes(value)
        ? q(value)
        : undefined;
    case "date":
      return undefined;
  }
};

const blankLeaf = (spec: ScalarSpec): BlankLeaf => {
  // A captured default is a legal value of the base type, and a defaulted
  // field's z.input is optional anyway — the literal always satisfies input.
  const dflt = defaultLiteral(spec);
  if (dflt !== undefined) return { expr: dflt, satisfiesInput: true };
  switch (spec.kind) {
    case "string":
      return spec.nullable
        ? { expr: "null", satisfiesInput: true }
        : spec.optional
          ? { expr: "undefined", satisfiesInput: true }
          : // A todo-bearing stand-in LIES about the kind (z.custom degrades
            // here; walker truncation fires before .optional()/.nullable()
            // even unwrap), so a required fallback's `""` is a guess at an
            // unknown input type — it must force the as-unknown-as cast, or
            // the checked annotation ships a compile error to the consumer.
            // An optional/nullable fallback keeps its honest blank above:
            // those flags only come from wrappers that really unwrapped, so
            // undefined/null genuinely satisfy z.input.
            { expr: '""', satisfiesInput: spec.todo === undefined };
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
    // A tuple is fixed-arity: materialize every position's blank so each
    // element is addressable at its static index.
    case "tuple":
      return `[${spec.elements.map((el) => emitInitialValues(el, level)).join(", ")}]`;
    // A union starts as its first variant, concretely shaped: the
    // discriminant set to that variant's tag, its fields blank.
    case "union": {
      const first = spec.variants[0];
      if (first === undefined) return "{}";
      const lines = [
        `${ind(level + 1)}${propKey(spec.discriminant)}: ${q(first.tag)},`,
        ...first.fields.map(
          (field) =>
            `${ind(level + 1)}${propKey(field.name)}: ${emitInitialValues(field.spec, level + 1)},`,
        ),
      ];
      return `{\n${lines.join("\n")}\n${ind(level)}}`;
    }
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
    // A tuple materializes every element's blank, so any element that can't
    // start legal (a required number/date/enum) forces the cast.
    case "tuple":
      return spec.elements.some((el) => blankNeedsCast(el));
    // The blank draft materializes the first variant only, so its fields
    // decide the cast (the discriminant is a plain string literal).
    case "union": {
      const first = spec.variants[0];
      return (
        first !== undefined && first.fields.some((f) => blankNeedsCast(f.spec))
      );
    }
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
      case "tuple":
        return `z.tuple([${spec.elements.map((el) => zodExpr(el, level)).join(", ")}])`;
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
      // Reconstruct the discriminant literal into each branch object.
      case "union": {
        const variants = spec.variants.map((variant) => {
          const fields = [
            `${ind(level + 2)}${propKey(spec.discriminant)}: z.literal(${q(variant.tag)}),`,
            ...variant.fields.flatMap((field) => [
              ...(field.spec.todo !== undefined
                ? [`${ind(level + 2)}// TODO: ${field.spec.todo}`]
                : []),
              `${ind(level + 2)}${propKey(field.name)}: ${zodExpr(field.spec, level + 2)},`,
            ]),
          ];
          return `${ind(level + 1)}z.object({\n${fields.join("\n")}\n${ind(level + 1)}}),`;
        });
        return `z.discriminatedUnion(${q(spec.discriminant)}, [\n${variants.join("\n")}\n${ind(level)}])`;
      }
    }
  })();
  const withNullable = spec.nullable ? `${base}.nullable()` : base;
  const withOptional = spec.optional ? `${withNullable}.optional()` : withNullable;
  // Outermost, after the wrappers — where fromZod's outermost-wins capture
  // reads it back, so a type-mode JSDoc description round-trips.
  return spec.description === undefined
    ? withOptional
    : `${withOptional}.describe(${q(spec.description)})`;
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
  // A discriminated-union field is present: gates the useField/useVariantField
  // imports the union rendering needs.
  union: boolean;
  // A field carries a config `fields` override with component "autocomplete"
  // (see ./overrides): it renders the autocomplete control INSTEAD of its
  // kind's default, so it counts here and NOT under string/enum — the
  // default Bound components and their imports must not be pulled in by an
  // override-only schema.
  autocomplete: boolean;
}>;

const NO_USAGE: KindUsage = {
  string: false,
  number: false,
  boolean: false,
  date: false,
  enum: false,
  union: false,
  autocomplete: false,
};

const mergeUsage = (a: KindUsage, b: KindUsage): KindUsage => ({
  string: a.string || b.string,
  number: a.number || b.number,
  boolean: a.boolean || b.boolean,
  date: a.date || b.date,
  enum: a.enum || b.enum,
  union: a.union || b.union,
  autocomplete: a.autocomplete || b.autocomplete,
});

// Whether this leaf renders the autocomplete override control instead of its
// kind's default (only ever true on string/enum leaves — applyFieldOverrides
// validates that loudly). Shared with the module layout.
export const isAutocompleteLeaf = (spec: FieldSpec): boolean =>
  spec.override?.component === "autocomplete";

// The options EXPRESSION an autocomplete leaf feeds its control: the
// generated component's `{name}Options` prop when the override declares one,
// else the enum's baked-in values as an array literal.
export const autocompleteOptionsExpr = (spec: FieldSpec): string =>
  spec.override?.optionsPropName ??
  `[${(spec.kind === "enum" ? spec.options : []).map(q).join(", ")}]`;

// The kinds a union's controls render: the discriminant is a select (enum),
// plus every variant field's kind. Shared with collectUsage so a union pulls
// in the right leaf builders/components even with no sibling of that kind.
const unionKindUsage = (
  spec: Extract<FieldSpec, Readonly<{ kind: "union" }>>,
): KindUsage =>
  spec.variants.reduce<KindUsage>(
    (acc, variant) =>
      variant.fields.reduce<KindUsage>(
        (inner, field) => mergeUsage(inner, collectUsage(field.spec)),
        acc,
      ),
    { ...NO_USAGE, union: true, enum: true },
  );

// `count` is the segment count of the path at which `spec` sits (0 for the
// root object). Subtrees the walkers degrade to a depth TODO render no
// control, so they must contribute no usage — an over-budget-only kind would
// otherwise emit an unused import. overDepthBudget mirrors fieldLines'
// boundary per kind.
export const collectUsage = (spec: FieldSpec, count = 0): KindUsage => {
  if (overDepthBudget(spec, count)) return NO_USAGE;
  switch (spec.kind) {
    case "object":
      return spec.fields.reduce(
        (acc, field) => mergeUsage(acc, collectUsage(field.spec, count + 1)),
        NO_USAGE,
      );
    case "array":
      return collectUsage(spec.item, count + 1);
    // Non-scalar elements render as TODOs, not controls, so they pull in no
    // builders — only scalar elements count toward usage.
    case "tuple":
      return spec.elements
        .filter(isScalarSpec)
        .reduce(
          (acc, el) => mergeUsage(acc, collectUsage(el, count + 1)),
          NO_USAGE,
        );
    case "union":
      return unionKindUsage(spec);
    default:
      // An overridden leaf renders the override control, not its kind's
      // default — count it as autocomplete only.
      return isAutocompleteLeaf(spec)
        ? { ...NO_USAGE, autocomplete: true }
        : { ...NO_USAGE, [spec.kind]: true };
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
      // Mirrors fieldLines' FieldPath boundary: an object at the budget is
      // emitted as a TODO (children can only exceed), and an array whose own
      // list path exceeds it can't bind its useFieldArray hook — neither may
      // claim a hook that the body never references.
      return overDepthBudget(spec, segments.length)
        ? []
        : spec.fields
            .filter((field) => !isUnaddressable(field.name))
            .flatMap((field) =>
              collectRawArrays(
                field.spec,
                [...segments, field.name],
                field.label,
              ),
            );
    case "array":
      // Arrays nested inside this array's items have dynamic paths; they are
      // emitted as TODO comments instead of hooks.
      return overDepthBudget(spec, segments.length)
        ? []
        : [{ segments, label, item: spec.item }];
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

// Allocate a field-binding var through the identifierSuffix used-set
// machinery, reserving the DERIVED `${varName}NumberProps` const alongside a
// number binding's own name (kit number bindings hoist that const next to
// the field hook): the chosen suffix must leave BOTH names free, and both
// are registered — so a schema field literally named "priceNumberProps" can
// collide with neither the hoisted const of a "price" number field
// (whichever allocates first) nor vice versa. Non-number vars reserve just
// themselves. Callers add every name in `reserved` to their used set.
export const allocateBindingVar = (
  base: string,
  isNumber: boolean,
  used: ReadonlySet<string>,
): Readonly<{ varName: string; reserved: readonly string[] }> => {
  if (!isNumber) {
    const varName = `${base}${identifierSuffix(base, used)}`;
    return { varName, reserved: [varName] };
  }
  const free = (candidate: string): boolean =>
    !used.has(candidate) && !used.has(`${candidate}NumberProps`);
  const next = (n: number): string =>
    free(`${base}${n}`) ? `${n}` : next(n + 1);
  const varName = `${base}${free(base) ? "" : next(2)}`;
  return { varName, reserved: [varName, `${varName}NumberProps`] };
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

// ---------------------------------------------------------------------------
// Discriminated unions (single-file backends)
// ---------------------------------------------------------------------------

export type UnionSpec = Extract<FieldSpec, Readonly<{ kind: "union" }>>;

// The variant field names present in EVERY variant — the union's COMMON keys
// (the discriminant is already absent from variant.fields). The library's
// VariantKeys<V> = Exclude<AllKeys, keyof V> excludes these, so useVariantField
// REJECTS a common key (it resolves to `never`); a common field must bind with
// plain useField on the typed union path instead. A single-variant union makes
// every field common (one member ⇒ all keys shared ⇒ no variant keys).
export const unionCommonFieldNames = (spec: UnionSpec): ReadonlySet<string> => {
  const [first, ...rest] = spec.variants;
  if (first === undefined) return new Set();
  return new Set(
    first.fields
      .map((field) => field.name)
      .filter((name) =>
        rest.every((variant) => variant.fields.some((f) => f.name === name)),
      ),
  );
};

// A discriminated union at a STATIC object path. The single-file backends
// can't render its variant fields with the path-typed <TextField form
// path=.../> components (variant paths fall outside FieldPath), so the union
// hoists its bindings to the component body: a plain useField for the
// discriminant and each COMMON field (common keys, addressable through
// FieldPath), and one useVariantField per variant-ONLY field (deduped by name
// — useVariantField keys on the field, unioning the types). The JSX renders
// the discriminant + common fields once (outside the variant blocks, since
// they exist in every variant) and the variant-only fields inside the matching
// block; every control renders from its bound variable via the raw prop
// builders.
type UnionFieldBinding = Readonly<{
  name: string;
  label: string;
  spec: FieldSpec;
  varName: string;
}>;

export type UnionEntry = Readonly<{
  path: string; // "payment"
  discriminant: string; // "method"
  discriminantPath: string; // "payment.method"
  discriminantVar: string; // "paymentMethod"
  tags: readonly string[];
  // Scalar fields present in every variant → useField on `path.name` (deduped).
  commonBindings: readonly UnionFieldBinding[];
  // Scalar variant-ONLY fields → useVariantField, one binding each (deduped).
  bindings: readonly UnionFieldBinding[];
  bindingByName: ReadonlyMap<string, UnionFieldBinding>;
  // Names bound as common (skipped inside the per-variant blocks).
  commonBindingNames: ReadonlySet<string>;
  variants: readonly UnionSpec["variants"][number][];
}>;

type RawUnionEntry = Readonly<{ segments: readonly string[]; spec: UnionSpec }>;

// Unions at static object paths (not inside array rows, not nested inside
// another union's variant). Each variant field is walked only one level; a
// container variant field stays a TODO at render time.
const collectRawUnions = (
  spec: FieldSpec,
  segments: readonly string[],
): readonly RawUnionEntry[] => {
  switch (spec.kind) {
    case "object":
      // Same FieldPath boundary as collectRawArrays: no hooks under a
      // depth-TODO'd object.
      return overDepthBudget(spec, segments.length)
        ? []
        : spec.fields
            .filter((field) => !isUnaddressable(field.name))
            .flatMap((field) =>
              collectRawUnions(field.spec, [...segments, field.name]),
            );
    case "union":
      // The discriminant and every field binding sit one segment past the
      // union's path, so the union needs headroom below the budget.
      return overDepthBudget(spec, segments.length) ? [] : [{ segments, spec }];
    default:
      return [];
  }
};

const unionEntry = (
  raw: RawUnionEntry,
  seed: ReadonlySet<string>,
): Readonly<{ entry: UnionEntry; used: ReadonlySet<string> }> => {
  const path = raw.segments.join(".");
  const discriminantVar = camelJoin([...raw.segments, raw.spec.discriminant]);
  const commonNames = unionCommonFieldNames(raw.spec);
  // Distinct scalar field names across the variants each get one binding,
  // deduped against the discriminant var and every array/union identifier
  // already claimed in this component, then split by whether the name is a
  // common key (useField) or variant-only (useVariantField).
  const initial: Readonly<{
    used: ReadonlySet<string>;
    commonBindings: readonly UnionFieldBinding[];
    bindings: readonly UnionFieldBinding[];
    seen: ReadonlySet<string>;
  }> = {
    used: new Set([...seed, discriminantVar]),
    commonBindings: [],
    bindings: [],
    seen: new Set<string>(),
  };
  const collected = raw.spec.variants
    .flatMap((variant) => variant.fields)
    .filter((field) => isScalarSpec(field.spec))
    .reduce((acc, field) => {
      if (acc.seen.has(field.name)) return acc;
      const base = camelJoin([...raw.segments, field.name]);
      // Number bindings reserve their hoisted `${var}NumberProps` const too
      // (kit backends emit it next to the hooks; see unionHooks) so a field
      // literally named like a derived const can't collide with it.
      const { varName, reserved } = allocateBindingVar(
        base,
        field.spec.kind === "number",
        acc.used,
      );
      const binding = { ...field, varName };
      const isCommon = commonNames.has(field.name);
      return {
        used: new Set([...acc.used, ...reserved]),
        commonBindings: isCommon
          ? [...acc.commonBindings, binding]
          : acc.commonBindings,
        bindings: isCommon ? acc.bindings : [...acc.bindings, binding],
        seen: new Set([...acc.seen, field.name]),
      };
    }, initial);
  return {
    used: collected.used,
    entry: {
      path,
      discriminant: raw.spec.discriminant,
      discriminantPath: `${path}.${raw.spec.discriminant}`,
      discriminantVar,
      tags: raw.spec.variants.map((variant) => variant.tag),
      commonBindings: collected.commonBindings,
      bindings: collected.bindings,
      bindingByName: new Map(
        collected.bindings.map((binding) => [binding.name, binding]),
      ),
      commonBindingNames: new Set(
        collected.commonBindings.map((binding) => binding.name),
      ),
      variants: [...raw.spec.variants],
    },
  };
};

const collectUnions = (
  root: ObjectSpec,
  seed: ReadonlySet<string>,
): readonly UnionEntry[] =>
  collectRawUnions(root, []).reduce<
    Readonly<{ used: ReadonlySet<string>; entries: readonly UnionEntry[] }>
  >(
    (acc, raw) => {
      const { entry, used } = unionEntry(raw, acc.used);
      return { used, entries: [...acc.entries, entry] };
    },
    { used: new Set(seed), entries: [] },
  ).entries;

// The discriminant + variant hook declarations for the component body.
// `numberPropsHook` (kit backends) additionally hoists the number-props
// hook call for every number binding — common and variant-only alike, and
// unconditionally even for fields of a currently-hidden variant, exactly
// like the useVariantField calls above them (React's rules of hooks).
const unionHooks = (
  unions: readonly UnionEntry[],
  level: number,
  numberPropsHook?: string,
): readonly string[] =>
  unions.flatMap((entry) => [
    `${ind(level)}const ${entry.discriminantVar} = useField(form, ${q(entry.discriminantPath)});`,
    ...entry.commonBindings.map(
      (binding) =>
        `${ind(level)}const ${binding.varName} = useField(form, ${q(`${entry.path}.${binding.name}`)});`,
    ),
    ...entry.bindings.map(
      (binding) =>
        `${ind(level)}const ${binding.varName} = useVariantField(form, ${q(entry.path)}, ${q(binding.name)});`,
    ),
    ...(numberPropsHook === undefined
      ? []
      : [...entry.commonBindings, ...entry.bindings]
          .filter((binding) => binding.spec.kind === "number")
          .map(
            (binding) =>
              `${ind(level)}const ${binding.varName}NumberProps = ${numberPropsHook}(${binding.varName});`,
          )),
  ]);

// The KindUsage of union CONTROLS only (discriminant select + variant field
// kinds), ignoring non-union siblings — so the plain backend imports exactly
// the prop builders its union rendering calls.
export const collectUnionUsage = (spec: FieldSpec, count = 0): KindUsage => {
  if (overDepthBudget(spec, count)) return NO_USAGE;
  switch (spec.kind) {
    case "object":
      return spec.fields.reduce(
        (acc, field) =>
          mergeUsage(acc, collectUnionUsage(field.spec, count + 1)),
        NO_USAGE,
      );
    case "array":
      return collectUnionUsage(spec.item, count + 1);
    case "union":
      return unionKindUsage(spec);
    default:
      return NO_USAGE;
  }
};

// Usage over the STATIC-leaf surface only: unions are OPAQUE (their
// discriminant, common, and variant fields all render from hoisted hooks via
// the raw prop builders, never via the leaf COMPONENTS), so they contribute
// nothing. Gates the leaf-component imports (TextField/SelectField/… and the
// kit Bound* components); the prop-builder and useField/useVariantField
// imports stay on total usage / collectUnionUsage, since union rendering does
// call them. Fixes leaf components imported-but-unused for a union-only kind.
export const collectStaticUsage = (spec: FieldSpec, count = 0): KindUsage => {
  if (overDepthBudget(spec, count)) return NO_USAGE;
  switch (spec.kind) {
    case "object":
      return spec.fields.reduce(
        (acc, field) =>
          mergeUsage(acc, collectStaticUsage(field.spec, count + 1)),
        NO_USAGE,
      );
    case "array":
      return collectStaticUsage(spec.item, count + 1);
    // Only the SCALAR elements render a static leaf; non-scalar elements are
    // TODOs, so they contribute no leaf-component import.
    case "tuple":
      return spec.elements
        .filter(isScalarSpec)
        .reduce(
          (acc, el) => mergeUsage(acc, collectStaticUsage(el, count + 1)),
          NO_USAGE,
        );
    case "union":
      return NO_USAGE;
    default:
      // Same override rule as collectUsage: an autocomplete leaf pulls in
      // the Bound autocomplete component, not its kind's default.
      return isAutocompleteLeaf(spec)
        ? { ...NO_USAGE, autocomplete: true }
        : { ...NO_USAGE, [spec.kind]: true };
  }
};

// Whether any STATIC scalar leaf (one rendered through a Bound* component —
// union controls render inline from hoisted hooks and carry their literal
// inline) has a captured description. Gates the `description` prop on
// BoundFieldProps and the Bound components' helper-text wiring, so
// description-free schemas keep byte-identical output. Mirrors
// collectStaticUsage's walk (same depth boundary, unions excluded).
const hasStaticDescriptions = (spec: FieldSpec, count = 0): boolean => {
  if (overDepthBudget(spec, count)) return false;
  switch (spec.kind) {
    case "object":
      return spec.fields.some((field) =>
        hasStaticDescriptions(field.spec, count + 1),
      );
    case "array":
      return hasStaticDescriptions(spec.item, count + 1);
    case "tuple":
      return spec.elements
        .filter(isScalarSpec)
        .some((el) => hasStaticDescriptions(el, count + 1));
    case "union":
      return false;
    default:
      return spec.description !== undefined;
  }
};

// One generated options prop (a config-fields autocomplete override with
// optionsProp): `name` is the collision-resolved prop identifier the
// component accepts as `readonly string[]`, `path` the override's config
// path ("*" marking array rows) for the emitted comment.
export type OptionsPropEntry = Readonly<{ name: string; path: string }>;

// The options props a subtree's overridden leaves consume, in IR order —
// what the generated component (or an extracted child Rows component) must
// accept and thread. Mirrors collectStaticUsage's walk: same depth boundary,
// unions/tuples excluded (overrides can't land there — applyFieldOverrides
// validates that), so a declared prop is always consumed by a rendered
// control.
export const collectOptionsProps = (
  spec: FieldSpec,
  count = 0,
  segments: readonly string[] = [],
): readonly OptionsPropEntry[] => {
  if (overDepthBudget(spec, count)) return [];
  switch (spec.kind) {
    case "object":
      return spec.fields
        .filter((field) => !isUnaddressable(field.name))
        .flatMap((field) =>
          collectOptionsProps(field.spec, count + 1, [
            ...segments,
            field.name,
          ]),
        );
    case "array":
      return collectOptionsProps(spec.item, count + 1, [...segments, "*"]);
    case "tuple":
    case "union":
      return [];
    default:
      return spec.override?.optionsPropName !== undefined
        ? [{ name: spec.override.optionsPropName, path: segments.join(".") }]
        : [];
  }
};

// Whether any union in the tree has a variant-ONLY scalar field — the sole
// source of a useVariantField call. Common fields (present in every variant,
// including every field of a single-variant union) bind with useField, so a
// union without variant-only fields needs no useVariantField import.
export const hasVariantFieldUsage = (spec: FieldSpec, count = 0): boolean => {
  if (overDepthBudget(spec, count)) return false;
  switch (spec.kind) {
    case "object":
      return spec.fields.some((field) =>
        hasVariantFieldUsage(field.spec, count + 1),
      );
    case "array":
      return hasVariantFieldUsage(spec.item, count + 1);
    case "union": {
      const common = unionCommonFieldNames(spec);
      return spec.variants.some((variant) =>
        variant.fields.some(
          (field) => isScalarSpec(field.spec) && !common.has(field.name),
        ),
      );
    }
    default:
      return false;
  }
};

// A path prefix under construction. For dynamic prefixes (inside array rows)
// `text` is already template-escaped — apart from the deliberate ${index}
// hole for the current row and ${p0}, ${p1}, ... holes for enclosing rows —
// because it ends up inside a backtick template. Static prefixes stay raw and
// are JSON-escaped as one piece at the end.
//
// `holes` (dynamic only) is the ordered list of ENCLOSING row-index prop names
// in scope (p0, p1, ...); the current row's own index is the literal `index`.
// `valueTypeExpr` (dynamic only) is the TS type of the value at this path — a
// nested array extracted from here types its empty item as
// `NonNullable<${valueTypeExpr}["field"]>[number]`.
type PathPrefix = Readonly<{
  dynamic: boolean;
  text: string;
  holes: readonly string[];
  valueTypeExpr: string;
}>;

const staticPrefix: PathPrefix = {
  dynamic: false,
  text: "",
  holes: [],
  valueTypeExpr: "",
};

const extendPrefix = (prefix: PathPrefix, name: string): PathPrefix => ({
  dynamic: prefix.dynamic,
  text: `${prefix.text}${prefix.dynamic ? templateEscape(name) : name}.`,
  holes: prefix.holes,
  // Descending into a nested object within a row narrows the value type, so a
  // nested array under it still types its item correctly.
  valueTypeExpr: prefix.dynamic
    ? `NonNullable<${prefix.valueTypeExpr}[${q(name)}]>`
    : "",
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
          "// A form starts blank: required numbers/dates/enums begin undefined",
          "// (and any TODO-degraded placeholder field starts as a blank guess),",
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
  // Module-level sections between the array decls and the component. Gets
  // total usage (adapters/builders), static-leaf usage (Bound* components),
  // and the root (the kit backends derive the description-slot gate from it).
  preamble: (
    usage: KindUsage,
    staticUsage: KindUsage,
    root: ObjectSpec,
  ) => readonly string[];
  // One bound control (or a todo fallback) for a scalar field.
  leaf: (
    spec: FieldSpec,
    attr: string,
    label: string,
    level: number,
  ) => readonly string[];
  // One control rendered from an already-bound field VARIABLE (a useField or
  // useVariantField result hoisted to the component body) — how the
  // discriminant select and each variant field of a union render.
  variantLeaf: (
    spec: FieldSpec,
    fieldVar: string,
    label: string,
    level: number,
  ) => readonly string[];
  // The emitted number-props HOOK name (kit backends only): number controls
  // bind through useState-backed raw-text state, so union NUMBER bindings
  // hoist `const ${var}NumberProps = ${hook}(${var});` next to the field
  // hooks (unionHooks) and the variant leaf spreads the hoisted const —
  // hooks can't be called inside the conditional variant blocks. Absent for
  // plain/shadcn/template backends, whose number bindings are stateless
  // builders called inline.
  numberPropsHook?: string;
  // Kit-native grid cells. Defined ONLY when the backend lays section
  // bodies out with a real layout component (MUI <Grid>, antd <Row>/<Col>,
  // mantine <Grid.Col>) whose children must each be wrapped — and only at
  // columns > 1, so its presence doubles as the "wrap children" signal.
  // CSS-grid backends (plain, chakra, shadcn) leave it undefined: their
  // children are grid items by placement alone. Returns the raw open/close
  // tags; fieldLines owns indentation. `item` is one column cell, `fullRow`
  // spans the row (nested sections, arrays, unions).
  gridChild?:
    | Readonly<{
        item: readonly [string, string];
        fullRow: readonly [string, string];
      }>
    // Explicit undefined is how a backend factory says "columns === 1, no
    // wrapping" without conditional spreads (exactOptionalPropertyTypes).
    | undefined;
  // Wrapper around a nested object's fields.
  objectSection: (
    label: string,
    level: number,
    body: readonly string[],
  ) => readonly string[];
  // Wrapper around a field array's mapped rows. rowBody arrives built at
  // level + 3 (the flat-chrome row depth — arraySectionLines cannot know
  // the kit's chrome); a kit whose chrome or row cells nest deeper shifts
  // it with shiftLines, the same way wrapSection shifts section bodies.
  arraySection: (
    entry: ArrayEntry,
    level: number,
    rowBody: readonly string[],
  ) => readonly string[];
  // Indentation level of the top-level field list.
  bodyLevel: number;
  // The kit's form shell in structured pieces, so emitForm can compose the
  // submit and --live shapes from one source: `open` is the element open up
  // to (not including) the onSubmit attribute, `afterSubmit` the remaining
  // attributes plus ">" and any inner wrapper opens, `submitButton` the
  // kit's submit control (omitted under --live), `close` the closing tags.
  formShell: Readonly<{
    open: readonly string[];
    afterSubmit: readonly string[];
    submitButton: readonly string[];
    close: readonly string[];
  }>;
}>;

// The discriminant select plus one conditional block per variant, all
// referencing hooks the component body already declared (see unionHooks).
const unionLines = (
  backend: Backend,
  entry: UnionEntry,
  label: string,
  level: number,
): readonly string[] => {
  const discriminantSpec: FieldSpec = {
    kind: "enum",
    options: entry.tags,
    optional: false,
    nullable: false,
  };
  return [
    ...backend.variantLeaf(discriminantSpec, entry.discriminantVar, label, level),
    // Common fields exist in every variant, so they render once, outside the
    // per-variant blocks — bound with useField (useVariantField rejects them).
    ...entry.commonBindings.flatMap((binding) =>
      backend.variantLeaf(binding.spec, binding.varName, binding.label, level),
    ),
    ...entry.variants.flatMap((variant) => [
      `${ind(level)}{${entry.discriminantVar}.value === ${q(variant.tag)} && (`,
      `${ind(level + 1)}<>`,
      ...variant.fields.flatMap((field): readonly string[] => {
        // Common fields already rendered above; only variant-only fields here.
        if (entry.commonBindingNames.has(field.name)) return [];
        const binding = entry.bindingByName.get(field.name);
        return binding === undefined
          ? [
              `${ind(level + 2)}{/* TODO: nested ${field.spec.kind} ${commentText(q(`${entry.path}.${field.name}`))} inside a union variant — extract it by hand */}`,
            ]
          : backend.variantLeaf(
              field.spec,
              binding.varName,
              field.label,
              level + 2,
            );
      }),
      `${ind(level + 1)}</>`,
      `${ind(level)})}`,
    ]),
  ];
};

// The mutable side-channel for single-file nested-array extraction: as
// fieldLines walks array rows, each nested array it meets appends a child
// `{Stem}Rows` component (its lines) here and returns a `<{Stem}Rows .../>`
// reference; `used` dedupes identifiers against each other and the top-level
// array names. The components are emitted before the main component.
type NestedCtx = Readonly<{
  components: string[][];
  used: Set<string>;
  schemaName: string;
}>;

const fieldLines = (
  backend: Backend,
  fields: readonly NamedField[],
  prefix: PathPrefix,
  level: number,
  arrays: ReadonlyMap<string, ArrayEntry>,
  unions: ReadonlyMap<string, UnionEntry>,
  ctx: NestedCtx,
  // True when these fields are the direct children of a kit grid container
  // (a section body under a gridChild backend). The ROOT field list is a
  // Stack/Flex in every backend, so the top-level call never sets it; array
  // ROW bodies live in per-row stacks, so they never set it either.
  inGrid = false,
): readonly string[] =>
  fields.flatMap((field): readonly string[] => {
    // A const binding so kind-narrowing survives into the cell closures
    // below (property narrowing on field.spec would not).
    const spec = field.spec;
    // Each child of a kit grid container becomes one wrapped cell; the
    // payload renders one level deeper to sit inside its wrapper. Bare
    // comments (TODOs) stay unwrapped — a comment is not an element, so it
    // creates no cell, while an empty wrapper would.
    const cell = (
      kind: "item" | "fullRow",
      payload: (lvl: number) => readonly string[],
    ): readonly string[] => {
      const wrap = inGrid ? backend.gridChild : undefined;
      if (wrap === undefined) return payload(level);
      const [open, close] = wrap[kind];
      return [ind(level) + open, ...payload(level + 1), ind(level) + close];
    };
    if (isUnaddressable(field.name)) {
      return [
        `${ind(level)}{/* TODO: field ${commentText(q(field.name))} skipped — "." in a key is not path-addressable (see formstand docs) */}`,
      ];
    }
    // The FieldPath budget check on the FULL bound path (template holes count
    // one segment each) — overDepthBudget picks the boundary per kind.
    // Over-budget shapes degrade to a TODO before any hook or map entry is
    // consulted.
    const fullPath =
      prefix.text +
      (prefix.dynamic ? templateEscape(field.name) : field.name);
    if (overDepthBudget(spec, pathSegmentCount(fullPath))) {
      return [depthTodoLine(fullPath, ind(level))];
    }
    switch (spec.kind) {
      case "object":
        return cell("fullRow", (lvl) => [
          ...todoComment(spec, lvl),
          ...backend.objectSection(
            field.label,
            lvl,
            fieldLines(
              backend,
              spec.fields,
              extendPrefix(prefix, field.name),
              lvl + 1,
              arrays,
              unions,
              ctx,
              // The nested section's own body is a kit grid exactly when
              // this backend wraps cells at all (gridChild exists only at
              // columns > 1).
              backend.gridChild !== undefined,
            ),
          ),
        ]);
      case "array": {
        if (prefix.dynamic) {
          // A nested array inside an array row: extract a child Rows component
          // (its own useFieldArray on the parent-indexed path) and reference
          // it here, instead of a TODO.
          return cell("fullRow", (lvl) =>
            emitNestedRows(backend, prefix, field, lvl, arrays, unions, ctx),
          );
        }
        const entry = arrays.get(prefix.text + field.name);
        return entry === undefined
          ? []
          : cell("fullRow", (lvl) =>
              arraySectionLines(backend, entry, lvl, arrays, unions, ctx),
            );
      }
      case "union": {
        // Unions inside an array row bind dynamic paths useVariantField can't
        // express; they stay a TODO (collectUnions skips them too).
        const entry = prefix.dynamic
          ? undefined
          : unions.get(prefix.text + field.name);
        return entry === undefined
          ? [
              `${ind(level)}{/* TODO: discriminated union ${commentText(q(prefix.text + field.name))} inside an array row is not supported; extract it by hand */}`,
            ]
          : cell("fullRow", (lvl) => [
              ...todoComment(spec, lvl),
              ...unionLines(backend, entry, field.label, lvl),
            ]);
      }
      case "tuple": {
        // Fixed positions bind at static numeric indices (coord.0, coord.1) —
        // no useFieldArray, no add/remove. Scalar elements render a control;
        // a non-scalar element (object/array/union/nested tuple) is a TODO.
        const elemPrefix = extendPrefix(prefix, field.name);
        const elements = spec.elements;
        // The tuple's own section body is a kit grid under a gridChild
        // backend, so its scalar elements are cells too.
        const elementCell = (
          lvl: number,
          payload: (inner: number) => readonly string[],
        ): readonly string[] => {
          const wrap = backend.gridChild;
          if (wrap === undefined) return payload(lvl);
          const [open, close] = wrap.item;
          return [ind(lvl) + open, ...payload(lvl + 1), ind(lvl) + close];
        };
        return cell("fullRow", (lvl) => [
          ...todoComment(spec, lvl),
          ...backend.objectSection(
            field.label,
            lvl,
            elements.flatMap((element, i): readonly string[] =>
              isScalarSpec(element)
                ? elementCell(lvl + 1, (inner) =>
                    backend.leaf(
                      element,
                      pathAttr(elemPrefix, String(i)),
                      `${field.label} ${i + 1}`,
                      inner,
                    ),
                  )
                : [
                    `${ind(lvl + 1)}{/* TODO: tuple element ${i} (${element.kind}) at ${commentText(q(elemPrefix.text + i))} isn't scalar — bind it by hand */}`,
                  ],
            ),
          ),
        ]);
      }
      default:
        return cell("item", (lvl) =>
          backend.leaf(spec, pathAttr(prefix, field.name), field.label, lvl),
        );
    }
  });

const arraySectionLines = (
  backend: Backend,
  entry: ArrayEntry,
  level: number,
  arrays: ReadonlyMap<string, ArrayEntry>,
  unions: ReadonlyMap<string, UnionEntry>,
  ctx: NestedCtx,
): readonly string[] => {
  const rowPrefix: PathPrefix = {
    dynamic: true,
    text: `${templateEscape(entry.path)}.\${index}.`,
    holes: [],
    valueTypeExpr: entry.itemTypeExpr,
  };
  // A scalar item binds one control per row; an object item lays its fields
  // out inline (nested arrays among them extract into child components). A
  // non-scalar item (an array-of-arrays, or an array of tuples/unions) can't
  // bind at the row's dynamic path — a TODO rather than an empty row.
  // A row binds one segment past the list path (`list.${index}`), so it can
  // exceed the FieldPath budget even when the list hook binds — and then the
  // depth TODO must be the advice (extraction is impossible within budget),
  // not the generic extract-a-row one. overBudgetFieldPaths mirrors both
  // decisions exactly.
  const rowPath = `${templateEscape(entry.path)}.\${index}`;
  const rowBody: readonly string[] =
    entry.item.kind === "object"
      ? fieldLines(backend, entry.item.fields, rowPrefix, level + 3, arrays, unions, ctx)
      : overDepthBudget(entry.item, pathSegmentCount(rowPath))
        ? [depthTodoLine(rowPath, ind(level + 3))]
        : isScalarSpec(entry.item)
          ? backend.leaf(entry.item, pathAttr(rowPrefix, ""), entry.label, level + 3)
          : [
              `${ind(level + 3)}{/* TODO: ${entry.item.kind} array-item in ${commentText(q(entry.path))} rows — extract a row component with its own useFieldArray */}`,
            ];
  return backend.arraySection(entry, level, rowBody);
};

// A nested array inside an array row compiles to a child `{Stem}Rows`
// component: it takes `form` plus the enclosing rows' indices as props
// (p0, p1, ...), runs its own useFieldArray on the parent-indexed path, and
// renders rows through the same backend.arraySection + fieldLines as a
// top-level array (so leaves render per-backend and deeper nesting recurses).
// The component is appended to ctx.components; this returns the reference.
const emitNestedRows = (
  backend: Backend,
  prefix: PathPrefix,
  field: NamedField,
  level: number,
  arrays: ReadonlyMap<string, ArrayEntry>,
  unions: ReadonlyMap<string, UnionEntry>,
  ctx: NestedCtx,
): readonly string[] => {
  const item = (field.spec as Extract<FieldSpec, { kind: "array" }>).item;
  // Options props consumed by overridden leaves inside this subtree: the
  // child component declares them and the reference passes them through from
  // the enclosing scope (the main component's props, or an outer child's own
  // threaded props), so the chain composes to any depth.
  const itemOptionsProps = collectOptionsProps(item).map((entry) => entry.name);
  // The enclosing row's own `index` becomes the next hole (pN) for this child.
  const nextHole = `p${prefix.holes.length}`;
  const listTemplate =
    prefix.text.replaceAll("${index}", `\${${nextHole}}`) +
    templateEscape(field.name);
  // Field segments (holes stripped) name the component and hook. Braces are
  // excluded from the hole body for the same linear-scan reason as
  // pathSegmentCount above.
  const segments = listTemplate
    .replace(/\$\{[^{}]+\}/g, "")
    .split(".")
    .filter((segment) => segment.length > 0);
  const base = pascalJoin(segments);
  const suffix = identifierSuffix(base, ctx.used);
  const stem = `${base}${suffix}`;
  ctx.used.add(stem);
  const compName = `${stem}Rows`;
  const hookName = `${camelJoin(segments)}${suffix}Array`;
  const emptyName = `empty${stem}Item`;
  const itemTypeExpr = `NonNullable<${prefix.valueTypeExpr}[${q(field.name)}]>[number]`;

  const childHoles = [...prefix.holes, nextHole];
  const childPrefix: PathPrefix = {
    dynamic: true,
    text: `${listTemplate}.\${index}.`,
    holes: childHoles,
    valueTypeExpr: itemTypeExpr,
  };
  // Same budget rule as arraySectionLines: a row binds one segment past the
  // (already-validated) list template, and an over-budget row's advice is
  // the depth TODO for every item kind.
  const rowPath = `${listTemplate}.\${index}`;
  const rowBody =
    item.kind === "object"
      ? fieldLines(backend, item.fields, childPrefix, 5, arrays, unions, ctx)
      : overDepthBudget(item, pathSegmentCount(rowPath))
        ? [depthTodoLine(rowPath, ind(5))]
        : isScalarSpec(item)
          ? backend.leaf(item, pathAttr(childPrefix, ""), field.label, 5)
          : [
              `${ind(5)}{/* TODO: ${item.kind} array-item in ${commentText(q(listTemplate))} rows — extract it by hand */}`,
            ];

  const synthEntry: ArrayEntry = {
    path: listTemplate,
    label: field.label,
    item,
    hookName,
    itemTypeName: `${stem}Item`,
    emptyItemName: emptyName,
    itemTypeExpr,
  };
  const component = [
    blankNeedsCast(item)
      ? `const ${emptyName} = ${emitInitialValues(item, 0)} as unknown as ${itemTypeExpr};`
      : `const ${emptyName}: ${itemTypeExpr} = ${emitInitialValues(item, 0)};`,
    "",
    `const ${compName} = ({`,
    "  form,",
    ...childHoles.map((hole) => `  ${hole},`),
    ...itemOptionsProps.map((name) => `  ${name},`),
    `}: Readonly<{ ${[
      "form: Form<typeof " + ctx.schemaName + ">",
      ...childHoles.map((hole) => `${hole}: number`),
      ...itemOptionsProps.map((name) => `${name}: readonly string[]`),
    ].join("; ")} }>) => {`,
    `  const ${hookName} = useFieldArray(form, \`${listTemplate}\`);`,
    "  return (",
    ...backend.arraySection(synthEntry, 2, rowBody),
    "  );",
    "};",
  ];
  ctx.components.push(component);

  const refAttrs = [
    "form={form}",
    ...prefix.holes.map((hole) => `${hole}={${hole}}`),
    `${nextHole}={index}`,
    ...itemOptionsProps.map((name) => `${name}={${name}}`),
  ].join(" ");
  return [`${ind(level)}<${compName} ${refAttrs} />`];
};

// The scaffold-mode blocks emitForm assembles around the component: the
// exported owner hook (--form-prop), the props type (--form-prop and/or
// --live), and the onValuesChange subscription effect (--live).
//
// Subscription-primitive choice (--live): the prop wires through
// form.watchValues, present since formstand 0.2 and returning its own
// unsubscribe — the lowest floor of the three candidates. useFormSelector
// (also 0.2+) is a render-side subscription, wrong shape for a callback
// prop; useFormValues is the nicest spelling but UNRELEASED (> 0.12), and
// generated output must not require an unpublished library version. The
// emitted comment names the post-release one-liner.
const scaffoldBlocks = (
  scaffold: ScaffoldOptions,
  formName: string,
  schemaName: string,
  optionsProps: readonly OptionsPropEntry[],
): Readonly<{
  beforeComponent: readonly string[];
  componentParams: string;
  formLines: readonly string[];
  effectLines: readonly string[];
}> => {
  const propsType = `${formName}Props`;
  const hookName = ownerHookName(formName);
  const mode = emittedMode(scaffold);
  const modeComment = scaffold.live
    ? [
        `// --live: the emitted mode is "onChange" (not the library default`,
        `// "onBlur") so live consumers never read values whose errors lag a`,
        "// blur behind.",
      ]
    : [];
  const useFormCall = `useForm(${schemaName}, { initialValues, mode: ${q(mode)} })`;
  const ownerHook = scaffold.formProp
    ? [
        "// The page owns the form: create it with this hook (or an",
        "// equivalent useForm call) and pass it down — the same instance can",
        "// drive this component and any other consumer of the values.",
        ...modeComment,
        `export const ${hookName} = () =>`,
        `  ${useFormCall};`,
        "",
      ]
    : [];
  const propsFields = [
    ...(scaffold.formProp ? [`  form: Form<typeof ${schemaName}>;`] : []),
    ...(scaffold.live
      ? [
          "  // Fires on every value change (values are replaced immutably,",
          "  // so reference identity tracks real changes) — drive a map, a",
          "  // preview, or an autosave from here.",
          "  onValuesChange?: (values: FormValues) => void;",
        ]
      : []),
    // Config-fields autocomplete overrides with optionsProp: the page
    // supplies the suggestion list — options are DATA (an airport list),
    // not schema.
    ...optionsProps.flatMap((entry) => [
      `  // Suggestions for the ${q(entry.path)} autocomplete override.`,
      `  ${entry.name}: readonly string[];`,
    ]),
  ];
  const propsBlock =
    propsFields.length === 0
      ? []
      : [
          `export type ${propsType} = Readonly<{`,
          ...propsFields,
          "}>;",
          "",
        ];
  const params = [
    ...(scaffold.formProp ? ["form"] : []),
    ...(scaffold.live ? ["onValuesChange"] : []),
    ...optionsProps.map((entry) => entry.name),
  ];
  return {
    beforeComponent: [...ownerHook, ...propsBlock],
    componentParams:
      params.length === 0 ? "" : `{ ${params.join(", ")} }: ${propsType}`,
    formLines: scaffold.formProp
      ? []
      : [
          ...modeComment.map((line) => `  ${line}`),
          `  const form = ${useFormCall};`,
        ],
    effectLines: scaffold.live
      ? [
          "  // form.watchValues (formstand >= 0.2) returns its own",
          "  // unsubscribe. On formstand > 0.12, useFormValues(form) is the",
          "  // render-side one-liner for the same subscription.",
          "  useEffect(",
          "    () =>",
          "      onValuesChange === undefined",
          "        ? undefined",
          "        : form.watchValues(onValuesChange),",
          "    [form, onValuesChange],",
          "  );",
        ]
      : [],
  };
};

const emitForm = (
  backend: Backend,
  { ir, formName, schemaImport, ...rest }: EmitFormOptions,
): string => {
  const scaffold = scaffoldOf(rest);
  const root = assertObjectRoot(ir);
  const usage = collectUsage(root);
  const staticUsage = collectStaticUsage(root);
  const arrays = collectArrays(root);
  const arrayMap: ReadonlyMap<string, ArrayEntry> = new Map(
    arrays.map((entry) => [entry.path, entry]),
  );
  // Options props (config-fields autocomplete overrides) are component
  // parameters: every other derived identifier — union binding vars, nested
  // Rows stems — must steer clear of them, so they seed both used-sets.
  const optionsProps = collectOptionsProps(root);
  const optionsPropNames = optionsProps.map((entry) => entry.name);
  // Union hook variables must not collide with array hook/type identifiers.
  const arrayIdents = new Set(
    arrays.flatMap((entry) => [
      entry.hookName,
      entry.itemTypeName,
      entry.emptyItemName,
    ]),
  );
  const unions = collectUnions(
    root,
    new Set([...arrayIdents, ...optionsPropNames]),
  );
  const unionMap: ReadonlyMap<string, UnionEntry> = new Map(
    unions.map((entry) => [entry.path, entry]),
  );
  // Render the body first: nested-array child components are collected into
  // `nested.components` as a side effect, and must be emitted (before the main
  // component) and their `Form` import added.
  const nested: NestedCtx = {
    components: [],
    used: new Set([...arrayIdents, formName, ...optionsPropNames]),
    schemaName: schemaImport.name,
  };
  const bodyLines = fieldLines(
    backend,
    root.fields,
    staticPrefix,
    backend.bodyLevel,
    arrayMap,
    unionMap,
    nested,
  );
  const nestedComponentLines = nested.components.flatMap((lines) => [
    ...lines,
    "",
  ]);
  const blocks = scaffoldBlocks(
    scaffold,
    formName,
    schemaImport.name,
    optionsProps,
  );
  return [
    "// Generated by formstand-cli — edit freely, this file is yours.",
    ...backend.header(usage, arrays, root),
    // Child Rows components take a typed `form` prop (the main component passes
    // its own down); the top-level component gets `form` from useForm — or,
    // under --form-prop, from its own typed prop.
    ...(nested.components.length > 0 || scaffold.formProp
      ? [`import type { Form } from "formstand";`]
      : []),
    schemaImportLine(schemaImport),
    "",
    valuesTypeAndInitials(root, schemaImport.name),
    arrayItemDecls(arrays),
    "",
    ...backend.preamble(usage, staticUsage, root),
    ...nestedComponentLines,
    ...blocks.beforeComponent,
    `export const ${formName} = (${blocks.componentParams}) => {`,
    ...blocks.formLines,
    ...(scaffold.live ? [] : ["  const submitting = useIsSubmitting(form);"]),
    ...blocks.effectLines,
    ...(arrays.length > 0 ? [arrayHooks(arrays, 1)] : []),
    ...(unions.length > 0
      ? unionHooks(unions, 1, backend.numberPropsHook)
      : []),
    "",
    "  return (",
    ...backend.formShell.open,
    ...onSubmitAttrLines("form", scaffold.live),
    ...backend.formShell.afterSubmit,
    ...bodyLines,
    ...(scaffold.live ? [] : backend.formShell.submitButton),
    ...backend.formShell.close,
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
  // A described field renders an always-visible muted helper line under the
  // control (className "zf-help" as the styling hook, like "zf-field"):
  // formstand's built-in field components own the error line internally, so
  // the description keeps its own separate slot — coexisting with the error
  // like Mantine's native description slot does — rather than swapping.
  const desc =
    spec.description !== undefined
      ? [`${ind(level)}<p className="zf-help">${jsxText(spec.description)}</p>`]
      : [];
  // The config-fields autocomplete override wins over the kind's default
  // control: an in-file AutocompleteField (input + native datalist — see
  // the preamble) instead of formstand's TextField/SelectField.
  if (isAutocompleteLeaf(spec)) {
    return [
      ...todo,
      `${ind(level)}{/* ${autocompleteSiteComment(spec)} */}`,
      `${ind(level)}<AutocompleteField`,
      `${ind(level + 1)}form={form}`,
      `${ind(level + 1)}${attr}`,
      `${ind(level + 1)}${jsxAttr("label", label)}`,
      `${ind(level + 1)}options={${autocompleteOptionsExpr(spec)}}`,
      `${ind(level)}/>`,
      ...desc,
    ];
  }
  switch (spec.kind) {
    case "string":
      return [
        ...todo,
        `${ind(level)}<TextField form={form} ${attr} ${jsxAttr("label", label)} />`,
        ...desc,
      ];
    case "date":
      return [
        ...todo,
        `${ind(level)}<DateField form={form} ${attr} ${jsxAttr("label", label)} />`,
        ...desc,
      ];
    case "number":
      return [
        ...todo,
        `${ind(level)}<NumberField form={form} ${attr} ${jsxAttr("label", label)} />`,
        ...desc,
      ];
    case "boolean":
      return [
        ...todo,
        `${ind(level)}<CheckboxField form={form} ${attr} ${jsxAttr("label", label)} />`,
        ...desc,
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
        ...desc,
      ];
    case "object":
    case "array":
    case "tuple":
    case "union":
      return [`${ind(level)}{/* unreachable: containers render elsewhere */}`];
  }
};

// The plain prop-builder name per scalar kind.
const PLAIN_BUILDER: Readonly<Record<string, string>> = {
  string: "textInputProps",
  number: "numberInputProps",
  date: "dateInputProps",
  boolean: "checkboxProps",
  enum: "selectProps",
};

// A control rendered from a bound field variable, using the raw prop
// builders — the discriminant select and every variant field of a union.
const plainVariantLeaf = (
  spec: FieldSpec,
  fieldVar: string,
  label: string,
  level: number,
): readonly string[] => {
  const error = [
    `${ind(level + 1)}{${fieldVar}.error?.[0] !== undefined ? (`,
    `${ind(level + 2)}<p role="alert">{${fieldVar}.error?.[0]}</p>`,
    `${ind(level + 1)}) : null}`,
  ];
  // The always-visible muted helper line — plain keeps the description in
  // its own slot next to the error line (see plainLeaf).
  const desc =
    spec.description !== undefined
      ? [
          `${ind(level + 1)}<p className="zf-help">${jsxText(spec.description)}</p>`,
        ]
      : [];
  switch (spec.kind) {
    case "boolean":
      return [
        `${ind(level)}<div className="zf-field">`,
        `${ind(level + 1)}<label className="zf-label">`,
        `${ind(level + 2)}<input {...checkboxProps(${fieldVar})} /> ${jsxText(label)}`,
        `${ind(level + 1)}</label>`,
        ...desc,
        ...error,
        `${ind(level)}</div>`,
      ];
    case "enum":
      return [
        `${ind(level)}<div className="zf-field">`,
        `${ind(level + 1)}<label className="zf-label">${jsxText(label)}</label>`,
        `${ind(level + 1)}<select {...selectProps(${fieldVar})}>`,
        `${ind(level + 2)}<option value="">{"Select…"}</option>`,
        ...spec.options.map(
          (option) =>
            `${ind(level + 2)}<option value=${jsxText(option)}>${jsxText(labelFromName(option))}</option>`,
        ),
        `${ind(level + 1)}</select>`,
        ...desc,
        ...error,
        `${ind(level)}</div>`,
      ];
    case "string":
    case "number":
    case "date":
      return [
        `${ind(level)}<div className="zf-field">`,
        `${ind(level + 1)}<label className="zf-label">${jsxText(label)}</label>`,
        `${ind(level + 1)}<input {...${PLAIN_BUILDER[spec.kind]}(${fieldVar})} />`,
        ...desc,
        ...error,
        `${ind(level)}</div>`,
      ];
    case "object":
    case "array":
    case "tuple":
    case "union":
      return [
        `${ind(level)}{/* unreachable: containers never bind as a variant field */}`,
      ];
  }
};

// The plain (and custom-template fallback) autocomplete override control:
// free text with suggestions as a plain input bound through formstand's
// textInputProps, the suggestion list a native <datalist> — no new
// dependency, and the field stays a string the user can type freely.
// Emitted once in the preamble when some static leaf carries the override.
const PLAIN_AUTOCOMPLETE_PROPS_TYPE: readonly string[] = [
  "type AutocompleteFieldProps = Readonly<{",
  "  form: FieldFormApi;",
  "  path: string;",
  "  label: string;",
  "  options: readonly string[];",
  "}>;",
];

const plainAutocompleteBody = (
  componentName: string,
): readonly string[] => [
  "",
  `const ${componentName} = ({`,
  "  form,",
  "  path,",
  "  label,",
  "  options,",
  `}: AutocompleteFieldProps) => {`,
  "  const field = useField<string | null | undefined>(form, path);",
  "  return (",
  '    <div className="zf-field">',
  '      <label className="zf-label">',
  "        {label}",
  "        <input list={`${path}-datalist`} {...textInputProps(field)} />",
  "      </label>",
  "      <datalist id={`${path}-datalist`}>",
  "        {options.map((option) => (",
  "          <option key={option} value={option} />",
  "        ))}",
  "      </datalist>",
  "      {field.error?.[0] !== undefined ? (",
  '        <p role="alert">{field.error?.[0]}</p>',
  "      ) : null}",
  "    </div>",
  "  );",
  "};",
];

const plainBackend = (
  visual: VisualOptions,
  scaffold: ScaffoldOptions,
): Backend => {
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
  header: (usage, arrays, root) => {
    const unionUsage = collectUnionUsage(root);
    // Leaf COMPONENTS are gated on static-leaf usage only: a union renders its
    // controls from hoisted hooks via the raw prop builders, never via these
    // components, so a union-only kind must not pull the component in.
    const staticUsage = collectStaticUsage(root);
    // The prop builders the union controls call (discriminant select +
    // common/variant field kinds), imported only when a union renders.
    const builderImports = usage.union
      ? [
          ...(unionUsage.string ? ["textInputProps"] : []),
          ...(unionUsage.number ? ["numberInputProps"] : []),
          ...(unionUsage.date ? ["dateInputProps"] : []),
          ...(unionUsage.boolean ? ["checkboxProps"] : []),
          ...(unionUsage.enum ? ["selectProps"] : []),
        ]
      : [];
    const formstandImports = [
      ...(staticUsage.boolean ? ["CheckboxField"] : []),
      ...(staticUsage.date ? ["DateField"] : []),
      ...(staticUsage.number ? ["NumberField"] : []),
      ...(staticUsage.enum ? ["SelectField"] : []),
      ...(staticUsage.string ? ["TextField"] : []),
      ...builderImports,
      // The in-file AutocompleteField (autocomplete override) binds through
      // textInputProps + useField; dedupe against the union builders above.
      ...(staticUsage.autocomplete &&
      !builderImports.includes("textInputProps")
        ? ["textInputProps"]
        : []),
      ...(arrays.length > 0 ? ["useFieldArray"] : []),
      ...(usage.union || staticUsage.autocomplete ? ["useField"] : []),
      ...(hasVariantFieldUsage(root) ? ["useVariantField"] : []),
      "useForm",
      ...(scaffold.live ? [] : ["useIsSubmitting"]),
    ];
    return [
      ...reactImportLines(false, false, scaffold.live),
      `import { z } from "zod";`,
      "import {",
      ...formstandImports.map((name) => `  ${name},`),
      // FieldFormApi types the in-file AutocompleteField's form prop.
      ...(staticUsage.autocomplete ? ["  type FieldFormApi,"] : []),
      `} from "formstand";`,
    ];
  },
  preamble: (_usage, staticUsage) =>
    staticUsage.autocomplete
      ? [
          [
            "// ---- autocomplete override (config fields) ---------------------------------",
            ...PLAIN_AUTOCOMPLETE_PROPS_TYPE,
            ...plainAutocompleteBody("AutocompleteField"),
          ].join("\n"),
          "",
        ]
      : [],
  leaf: plainLeaf,
  variantLeaf: plainVariantLeaf,
  objectSection: (label, level, body) =>
    visual.sections === "collapsible"
      ? [
          `${ind(level)}<details open${styleAttr(span)}>`,
          `${ind(level + 1)}<summary style={{ cursor: "pointer", fontWeight: 600 }}>${jsxText(label)}</summary>`,
          ...(cols > 1
            ? [
                `${ind(level + 1)}<div${styleAttr(grid)}>`,
                // The body was built at level+1; inside the grid div it
                // belongs one deeper.
                ...shiftLines(body, 1),
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
    // The array-level error (z.array().min(...) etc.) — the same line the
    // module layout's list shell renders.
    `${ind(level + 1)}{${entry.hookName}.error ? <p role="alert">{${entry.hookName}.error[0]}</p> : null}`,
    `${ind(level + 1)}<button type="button" onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}>`,
    `${ind(level + 2)}${jsxText(`Add ${entry.label.toLowerCase()}`)}`,
    `${ind(level + 1)}</button>`,
    `${ind(level)}${visual.sections === "collapsible" ? "</details>" : "</section>"}`,
  ],
  bodyLevel: 3,
  formShell: {
    open: ["    <form"],
    afterSubmit: ["    >"],
    submitButton: [
      `      <button type="submit" disabled={submitting}>`,
      `        {submitting ? "Submitting..." : "Submit"}`,
      "      </button>",
    ],
    close: ["    </form>"],
  },
  };
};

export const emitPlainForm = (options: EmitFormOptions): string =>
  emitForm(
    plainBackend(options.visual ?? DEFAULT_VISUAL, scaffoldOf(options)),
    options,
  );

// ---------------------------------------------------------------------------
// Snippets shared by the component-kit backends (MUI + shadcn)
// ---------------------------------------------------------------------------

// The grid each section's fields flow into, in each ui's dialect — emitted
// as PROPERTY/CLASS fragments (not whole objects) so wrappers can merge
// them with span and chrome styles. One source: the single-file backends
// and the module layout must emit identical grids for the same --columns.
// Responsive on purpose: --columns N means "N columns WHEN THERE IS ROOM,
// stacking as width runs out" — nobody asks for 2 columns wanting 110px
// inputs on a phone. Inline styles cannot carry a media query, so the track
// is the CSS clamp idiom: the calc caps the count at N (each track must fit
// its share of the row), the 220px floor collapses columns that would drop
// below a usable input width. auto-fit tracks are explicit tracks, so the
// section-root `gridColumn: "1 / -1"` span keeps working.
export const gridStyleProps = (columns: number): string =>
  `display: "grid", gridTemplateColumns: ${q(responsiveGridTracks(columns))}, gap: 16`;

export const responsiveGridTracks = (columns: number): string =>
  `repeat(auto-fit, minmax(max(220px, calc((100% - ${String(
    16 * (columns - 1),
  )}px) / ${String(columns)})), 1fr))`;

// MUI's sx takes responsive objects natively, so the collapse is a real
// breakpoint (sm, 600px) rather than the clamp trick.
export const gridSxProps = (columns: number): string =>
  `display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(${String(
    columns,
  )}, minmax(0, 1fr))" }, gap: 2`;

export const gridColsClass = (columns: number): string =>
  columns > 1 ? ` md:grid-cols-${columns}` : "";

export const hasLeafUsage = (usage: KindUsage): boolean =>
  usage.string ||
  usage.date ||
  usage.number ||
  usage.boolean ||
  usage.enum ||
  usage.autocomplete;

// The kit backends the shared snippet helpers below parameterize over
// (everything but plain and custom templates).
export type KitUi = "mui" | "shadcn" | "chakra" | "mantine" | "antd";

// The emitted builder/hook name for a text-shaped scalar binding, per kit —
// one production for every site that used to restate these as ternaries.
// Kit NUMBER bindings are use-prefixed HOOKS (they hold raw-text state; see
// numberTextHook below) — except shadcn's, which stays a stateless
// type="number" builder.
export const kitScalarBinding = (
  ui: KitUi,
  kind: "string" | "number" | "date",
): string => {
  const stem = kind === "number" ? "Number" : kind === "date" ? "Date" : "Text";
  const base = `${ui}${stem}${ui === "mui" ? "Field" : "Input"}Props`;
  return kind === "number" && ui !== "shadcn"
    ? `use${base.charAt(0).toUpperCase()}${base.slice(1)}`
    : base;
};

// The react import for a kit header or module adapter: the number hook holds
// useState-backed raw-text state, so number usage promotes the type-only
// ChangeEvent import to a value import carrying useState. shadcn passes
// needsNumberState: false — its number binding is the stateless
// type="number" input.
// `needsEffect` (--live) adds useEffect for the onValuesChange
// subscription; number usage still promotes the whole import to a value
// import carrying useState.
// `needsSyntheticEvent` (mui autocomplete only): the muiAutocompleteProps
// builder types onInputChange's event parameter with React's SyntheticEvent.
export const reactImportLines = (
  needsChangeEvent: boolean,
  needsNumberState: boolean,
  needsEffect = false,
  needsSyntheticEvent = false,
): readonly string[] => {
  const names = [
    ...(needsEffect ? ["useEffect"] : []),
    ...(needsNumberState ? ["useState"] : []),
    ...(needsChangeEvent || needsNumberState ? ["type ChangeEvent"] : []),
    ...(needsSyntheticEvent ? ["type SyntheticEvent"] : []),
  ];
  return names.length === 0
    ? []
    : names.every((name) => name.startsWith("type "))
      ? [
          `import type { ${names.map((name) => name.slice("type ".length)).join(", ")} } from "react";`,
        ]
      : [`import { ${names.join(", ")} } from "react";`];
};

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

// The emitted raw-text number-editing hook, shared verbatim by the four
// stateful kit adapters (only the ChangeEvent element type differs). It
// REPLICATES formstand's own useNumberInput (src/react/fields.tsx)
// semantics exactly — emitted INLINE instead of imported because generated
// output keeps its formstand >= 0.3.0 floor (the library only exports
// useNumberInput from 0.11.0): local raw text while editing, keystrokes that parse (shared
// parseNumberText rules) pushed to the form, partial entries ("-", "1.",
// "1e") kept locally, blur snapping the display to the canonical value, and
// an external form-value change while editing dropping the raw text
// (render-phase derived-state reset). Kit chrome (labels, error props,
// inputMode) stays in each kit's number hook.
const numberTextHook = (eventTarget: string): readonly string[] => [
  "",
  "type NumberEditState = Readonly<{",
  "  raw: string | null;",
  "  // The form value the hook last wrote (or observed when it kept a",
  "  // partial entry). When field.value diverges, an external writer",
  "  // (reset/adoptValues/another field) changed it — drop the raw text so",
  "  // the input shows it.",
  "  pushed: number | null | undefined;",
  "}>;",
  "",
  "const IDLE_NUMBER_EDIT: NumberEditState = { raw: null, pushed: undefined };",
  "",
  "// Holds the raw text while editing so intermediate, not-yet-valid numbers",
  '// ("-", "1.", "1e") stay visible instead of being reparsed away (a naive',
  '// controlled value={String(n)} binding eats the "." of "85000.50" and the',
  '// "-" of "-5" as they are typed). Mirrors formstand\'s own useNumberInput.',
  "const useNumberText = <T extends number | null | undefined>(",
  "  field: UseFieldReturn<T>,",
  ") => {",
  "  const [edit, setEdit] = useState<NumberEditState>(IDLE_NUMBER_EDIT);",
  "  const externallyChanged =",
  "    edit.raw !== null && !Object.is(field.value, edit.pushed);",
  "  if (externallyChanged) {",
  "    setEdit(IDLE_NUMBER_EDIT);",
  "  }",
  "  const raw = externallyChanged ? null : edit.raw;",
  "  return {",
  "    value: raw ?? numberToInputText(field.value),",
  `    onChange: (e: ChangeEvent<${eventTarget}>) => {`,
  "      const text = e.target.value;",
  "      const parsed = parseNumberText(text);",
  "      switch (parsed.kind) {",
  '        case "empty": {',
  "          const empty = field.emptyValue;",
  "          setEdit({ raw: text, pushed: empty });",
  "          field.setValue(empty as T);",
  "          return;",
  "        }",
  '        case "number":',
  "          setEdit({ raw: text, pushed: parsed.value });",
  "          field.setValue(parsed.value as T);",
  "          return;",
  '        case "invalid":',
  "          // Partial entry: keep the text, remember the untouched form",
  "          // value so it doesn't read as an external change.",
  "          setEdit({ raw: text, pushed: field.value });",
  "          return;",
  "      }",
  "    },",
  "    onBlur: () => {",
  "      setEdit(IDLE_NUMBER_EDIT);",
  "      field.onBlur();",
  "    },",
  "  };",
  "};",
];

// Gated like the components that use it: BoundFieldProps references
// FieldFormApi, whose import only exists when some leaf renders — an
// unconditional type would emit non-compiling code for leaf-free schemas.
const boundFieldProps = (
  usage: KindUsage,
  withDescription = false,
): readonly string[] =>
  hasLeafUsage(usage)
    ? [
        "",
        "type BoundFieldProps = Readonly<{",
        "  form: FieldFormApi;",
        "  path: string;",
        "  label: string;",
        ...(withDescription ? ["  description?: string;"] : []),
        "}>;",
      ]
    : [];

// The scalar kinds whose emitted control has a natural helper-text slot for
// a captured description, per kit. Booleans are skipped where the boolean
// control has no slot: MUI's FormControlLabel/Switch, chakra's Switch.Root,
// and antd's bare Checkbox render label + control only, while shadcn's
// checkbox row sits in a grid wrapper with room for the muted line, mantine's
// Switch has a native `description` prop, and plain's markup renders an
// explicit helper line. (plain here also stands in for the custom-template
// fallback, which reuses plain's markup.)
export const describedLeafKinds = (
  ui: KitUi | "plain",
): ReadonlySet<FieldSpec["kind"]> => {
  switch (ui) {
    case "mui":
    case "chakra":
    case "antd":
      return new Set(["string", "number", "date", "enum"]);
    case "plain":
    case "shadcn":
    case "mantine":
      return new Set(["string", "number", "date", "enum", "boolean"]);
  }
};

// The one production of the override-site documentation comment (single-file
// backends and the module layout share it, so the wording can't drift): what
// feeds the suggestions, and that the field stays free text.
export const autocompleteSiteComment = (spec: FieldSpec): string =>
  spec.override?.optionsPropName !== undefined
    ? spec.kind === "enum"
      ? `autocomplete override: suggestions from the ${spec.override.optionsPropName} prop (replaces the enum values); free text stays allowed`
      : `autocomplete override: suggestions from the ${spec.override.optionsPropName} prop; free text stays allowed`
    : "autocomplete override: enum options baked in as suggestions; free text stays allowed";

// Both kit backends emit identical Bound* elements per leaf kind; they
// differ only in which component binds a boolean (MUI renders a Switch,
// shadcn a Checkbox) and in which kinds forward a captured description
// (`describedKinds` — the Bound component owns the kit's helper-text slot,
// the leaf just passes the literal through).
const boundLeaf =
  (
    booleanField: string,
    describedKinds: ReadonlySet<FieldSpec["kind"]>,
  ): Backend["leaf"] =>
  (spec, attr, label, level) => {
    const todo = todoComment(spec, level);
    const desc =
      spec.description !== undefined && describedKinds.has(spec.kind)
        ? ` ${jsxAttr("description", spec.description)}`
        : "";
    // The config-fields autocomplete override wins over the kind's default
    // control (string OR enum — an overridden enum upgrades its select to
    // the combobox): one Bound component, the options threaded as a prop or
    // baked from the enum.
    if (isAutocompleteLeaf(spec)) {
      return [
        ...todo,
        `${ind(level)}{/* ${autocompleteSiteComment(spec)} */}`,
        `${ind(level)}<BoundAutocompleteField`,
        `${ind(level + 1)}form={form}`,
        `${ind(level + 1)}${attr}`,
        `${ind(level + 1)}${jsxAttr("label", label)}`,
        ...(desc === "" ? [] : [`${ind(level + 1)}${desc.trimStart()}`]),
        `${ind(level + 1)}options={${autocompleteOptionsExpr(spec)}}`,
        `${ind(level)}/>`,
      ];
    }
    switch (spec.kind) {
      case "string":
        return [
          ...todo,
          `${ind(level)}<BoundTextField form={form} ${attr} ${jsxAttr("label", label)}${desc} />`,
        ];
      case "date":
        return [
          ...todo,
          `${ind(level)}<BoundDateField form={form} ${attr} ${jsxAttr("label", label)}${desc} />`,
        ];
      case "number":
        return [
          ...todo,
          `${ind(level)}<BoundNumberField form={form} ${attr} ${jsxAttr("label", label)}${desc} />`,
        ];
      case "boolean":
        return [
          ...todo,
          `${ind(level)}<${booleanField} form={form} ${attr} ${jsxAttr("label", label)}${desc} />`,
        ];
      case "enum":
        return [
          ...todo,
          `${ind(level)}<BoundSelectField`,
          `${ind(level + 1)}form={form}`,
          `${ind(level + 1)}${attr}`,
          `${ind(level + 1)}${jsxAttr("label", label)}`,
          ...(desc === ""
            ? []
            : [`${ind(level + 1)}${desc.trimStart()}`]),
          `${ind(level + 1)}options={[${spec.options.map(q).join(", ")}]}`,
          `${ind(level)}/>`,
        ];
      case "object":
      case "array":
      case "tuple":
      case "union":
        return [
          `${ind(level)}{/* unreachable: containers render elsewhere */}`,
        ];
    }
  };

// The formstand import block shared verbatim by the five kit backends:
// value imports (the shared text rules + hooks) and the type imports the
// emitted adapters/components reference.
const kitFormstandImportLines = (
  usage: KindUsage,
  arrays: readonly ArrayEntry[],
  root: ObjectSpec,
  scaffold: ScaffoldOptions,
): readonly string[] => {
  const hasLeaf = hasLeafUsage(usage);
  // FieldFormApi is referenced only by the Bound* components' props type:
  // union controls render raw kit elements from hoisted hooks, so static-leaf
  // usage gates it.
  const hasStaticLeaf = hasLeafUsage(collectStaticUsage(root));
  const values = [
    ...(usage.number ? ["numberToInputText", "parseNumberText"] : []),
    ...(usage.date ? ["dateToInputText", "parseDateText"] : []),
    ...(hasLeaf ? ["useField"] : []),
    ...(hasVariantFieldUsage(root) ? ["useVariantField"] : []),
    ...(arrays.length > 0 ? ["useFieldArray"] : []),
    "useForm",
    ...(scaffold.live ? [] : ["useIsSubmitting"]),
  ];
  const types = [
    ...(hasStaticLeaf ? ["FieldFormApi"] : []),
    ...(hasLeaf ? ["UseFieldReturn"] : []),
  ];
  return [
    "import {",
    ...values.map((name) => `  ${name},`),
    ...types.map((name) => `  type ${name},`),
    `} from "formstand";`,
  ];
};

// The objectSection production every kit backend shares: wrap the body in
// the kit's sectionOpen/sectionClose pair. bodyDelta is how many levels
// DEEPER than the historical level+1 the body must sit — the depth of the
// chrome's innermost container beyond the section tag itself (flat chrome
// is one element, so 0; a Card+CardContent+Grid stack adds 2). Without the
// shift, panel/collapsible cells render shallower than the container that
// holds them and a host Prettier pass reflows every generated file.
const wrapSection =
  (
    sectionOpen: (label: string, level: number) => readonly string[],
    sectionClose: (level: number) => readonly string[],
    bodyDelta = 0,
  ): Backend["objectSection"] =>
  (label, level, body) => [
    ...sectionOpen(label, level),
    ...shiftLines(body, bodyDelta),
    ...sectionClose(level),
  ];

// A control rendered from a bound field variable, using the in-file MUI
// adapter builders — the discriminant select and each variant field of a
// union (the path-typed Bound* components can't reach variant paths).
const muiVariantLeaf = (
  spec: FieldSpec,
  fieldVar: string,
  label: string,
  level: number,
): readonly string[] => {
  // A described variant field inlines its literal into MUI's one helper-text
  // slot, after the adapter spread — same swap rule as the Bound components
  // (error keeps the slot while present).
  const helper =
    spec.description !== undefined
      ? ` helperText={fieldError(${fieldVar}) ?? ${q(spec.description)}}`
      : "";
  switch (spec.kind) {
    case "boolean":
      return [
        `${ind(level)}<FormControlLabel`,
        `${ind(level + 1)}${jsxAttr("label", label)}`,
        `${ind(level + 1)}control={<Switch {...muiSwitchProps(${fieldVar})} />}`,
        `${ind(level)}/>`,
      ];
    case "enum":
      return [
        `${ind(level)}<TextField select fullWidth ${jsxAttr("label", label)} {...muiSelectProps(${fieldVar})}${helper}>`,
        ...spec.options.map(
          (option) =>
            `${ind(level + 1)}<MenuItem value=${jsxText(option)}>${jsxText(labelFromName(option))}</MenuItem>`,
        ),
        `${ind(level)}</TextField>`,
      ];
    // Number props come from the hoisted `${var}NumberProps` const (see
    // unionHooks): the number binding is a STATE-holding hook, and hooks
    // can't be called inside the conditional variant blocks.
    case "number":
      return [
        `${ind(level)}<TextField fullWidth ${jsxAttr("label", label)} {...${fieldVar}NumberProps}${helper} />`,
      ];
    case "date":
      return [
        `${ind(level)}<TextField fullWidth ${jsxAttr("label", label)} {...${kitScalarBinding("mui", "date")}(${fieldVar})}${helper} />`,
      ];
    case "string":
      return [
        `${ind(level)}<TextField fullWidth ${jsxAttr("label", label)} {...${kitScalarBinding("mui", "string")}(${fieldVar})}${helper} />`,
      ];
    case "object":
    case "array":
    case "tuple":
    case "union":
      return [
        `${ind(level)}{/* unreachable: containers never bind as a variant field */}`,
      ];
  }
};

// The shadcn twin: renders from a bound field variable via the in-file
// shadcn adapter builders, keyed off the field's own path for its ids.
const shadcnVariantLeaf = (
  spec: FieldSpec,
  fieldVar: string,
  label: string,
  level: number,
): readonly string[] => {
  const id = `{${fieldVar}.path}`;
  // The muted description line, rendered only while the error line is not —
  // the two share the one slot under the control.
  const descLines =
    spec.description !== undefined
      ? [
          `${ind(level + 1)}{fieldError(${fieldVar}) === undefined ? (`,
          `${ind(level + 2)}<p className="text-sm text-muted-foreground">${jsxText(spec.description)}</p>`,
          `${ind(level + 1)}) : null}`,
        ]
      : [];
  switch (spec.kind) {
    case "boolean":
      return [
        `${ind(level)}<div className="grid gap-2">`,
        `${ind(level + 1)}<div className="flex items-center gap-2">`,
        `${ind(level + 2)}<Checkbox id=${id} {...shadcnCheckboxProps(${fieldVar})} />`,
        `${ind(level + 2)}<Label htmlFor=${id}>${jsxText(label)}</Label>`,
        `${ind(level + 1)}</div>`,
        ...descLines,
        `${ind(level + 1)}<FieldError field={${fieldVar}} />`,
        `${ind(level)}</div>`,
      ];
    case "enum":
      return [
        `${ind(level)}<div className="grid gap-2">`,
        `${ind(level + 1)}<Label htmlFor=${id}>${jsxText(label)}</Label>`,
        `${ind(level + 1)}<Select {...shadcnSelectProps(${fieldVar})}>`,
        `${ind(level + 2)}<SelectTrigger id=${id} className="w-full" aria-invalid={ariaInvalid(${fieldVar})}>`,
        `${ind(level + 3)}<SelectValue placeholder=${jsxText(`Select ${label.toLowerCase()}`)} />`,
        `${ind(level + 2)}</SelectTrigger>`,
        `${ind(level + 2)}<SelectContent>`,
        ...spec.options.map(
          (option) =>
            `${ind(level + 3)}<SelectItem value=${jsxText(option)}>${jsxText(labelFromName(option))}</SelectItem>`,
        ),
        `${ind(level + 2)}</SelectContent>`,
        `${ind(level + 1)}</Select>`,
        ...descLines,
        `${ind(level + 1)}<FieldError field={${fieldVar}} />`,
        `${ind(level)}</div>`,
      ];
    case "string":
    case "number":
    case "date": {
      const builder = kitScalarBinding("shadcn", spec.kind);
      return [
        `${ind(level)}<div className="grid gap-2">`,
        `${ind(level + 1)}<Label htmlFor=${id}>${jsxText(label)}</Label>`,
        `${ind(level + 1)}<Input id=${id} {...${builder}(${fieldVar})} />`,
        ...descLines,
        `${ind(level + 1)}<FieldError field={${fieldVar}} />`,
        `${ind(level)}</div>`,
      ];
    }
    case "object":
    case "array":
    case "tuple":
    case "union":
      return [
        `${ind(level)}{/* unreachable: containers never bind as a variant field */}`,
      ];
  }
};

// ---------------------------------------------------------------------------
// MUI backend (@mui/material 5–9, one emitter + a per-version config)
// ---------------------------------------------------------------------------

// Shared rules: sx over system props, MenuItem children inside a select
// TextField, Stack for layout to stay out of Grid's way entirely. The one
// prop-surface delta across the supported majors (5, 6, 7, 9 — MUI skipped
// 8) is TextField's slot-props API, encoded below; everything else the
// backend emits typechecks identically against every major (verified
// empirically by the cli/matrix harness against each major's .d.ts).

// Internal-only (no external consumers): the per-major emission deltas.
type MuiVersionConfig = Readonly<{
  // v6+ TextField takes slot overrides via `slotProps.{input,inputLabel}`;
  // v5 has only the legacy `InputProps` / `InputLabelProps` component
  // props (v9 REMOVED those, v6–7 keep them deprecated — so the modern
  // spelling is emitted everywhere it exists).
  textFieldSlotProps: boolean;
  // Grid's size prop only exists from v7 (where Grid2 was renamed Grid);
  // in v5 AND v6 the plain Grid is the legacy item/xs/sm one, so both get
  // the legacy spelling. The matrix against real v6 declarations is what
  // established this — v6's size-prop grid is the separate Grid2 import.
  gridSizeProp: boolean;
}>;

const MUI_VERSION_CONFIGS: Readonly<Record<MuiVersion, MuiVersionConfig>> = {
  5: { textFieldSlotProps: false, gridSizeProp: false },
  6: { textFieldSlotProps: true, gridSizeProp: false },
  7: { textFieldSlotProps: true, gridSizeProp: true },
  9: { textFieldSlotProps: true, gridSizeProp: true },
};

const muiVersionConfig = (
  version: MuiVersion = DEFAULT_MUI_VERSION,
): MuiVersionConfig => MUI_VERSION_CONFIGS[version];

export const muiAdapterSection = (
  usage: KindUsage,
  exp = "",
  version: MuiVersion = DEFAULT_MUI_VERSION,
): string => {
  const { textFieldSlotProps } = muiVersionConfig(version);
  const needsError =
    usage.string ||
    usage.date ||
    usage.number ||
    usage.enum ||
    usage.autocomplete;
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
  // A HOOK, not a builder: value/onChange/onBlur come from the raw-text
  // editing state (useNumberText), so typing "85000.50" or "-5" is never
  // reparsed into "8500050"/"5" mid-entry.
  const numberAdapter = [
    ...numberTextHook("HTMLInputElement | HTMLTextAreaElement"),
    "",
    `${exp}const useMuiNumberFieldProps = <T extends number | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    "  error: fieldError(field) !== undefined,",
    "  helperText: fieldError(field),",
    textFieldSlotProps
      ? '  slotProps: { input: { inputMode: "decimal" as const } },'
      : '  InputProps: { inputMode: "decimal" as const },',
    "  ...useNumberText(field),",
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
  const dateAdapter = [
    "",
    `${exp}const muiDateFieldProps = <T extends Date | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  type: "date" as const,',
    "  name: field.path,",
    "  value: dateToInputText(field.value),",
    "  error: fieldError(field) !== undefined,",
    "  helperText: fieldError(field),",
    "  // A date input always shows placeholder chrome; keep the label floated.",
    textFieldSlotProps
      ? "  slotProps: { inputLabel: { shrink: true } },"
      : "  InputLabelProps: { shrink: true },",
    "  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {",
    "    const parsed = parseDateText(e.target.value);",
    '    field.setValue((parsed.kind === "date" ? parsed.value : field.emptyValue) as T);',
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
  // Free text with suggestions (config-fields autocomplete override): the
  // field stays a string, so the binding is the INPUT value — controlled
  // inputValue + onInputChange. Typing fires onInputChange (reason "input")
  // and selecting a suggestion fires it too, so one channel updates the
  // form either way; `value` stays uncontrolled on purpose (freeSolo — the
  // selected-option value is not the source of truth, the text is).
  const autocompleteAdapter = [
    "",
    `${exp}const muiAutocompleteProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  freeSolo: true as const,",
    '  inputValue: field.value ?? "",',
    "  onInputChange: (_event: SyntheticEvent, value: string) => {",
    '    field.setValue((value === "" && field.emptyValue === null ? null : value) as T);',
    "  },",
    "  // Blur bubbles from the inner input to the Autocomplete root.",
    "  onBlur: field.onBlur,",
    "});",
  ];
  return [
    "// ---- formstand → MUI adapter ----------------------------------------------",
    ...(needsError ? withExportPrefix(FIELD_ERROR_HELPER, exp) : []),
    ...(usage.string ? textAdapter : []),
    ...(usage.number ? numberAdapter : []),
    ...(usage.date ? dateAdapter : []),
    ...(usage.enum ? selectAdapter : []),
    ...(usage.boolean ? switchAdapter : []),
    ...(usage.autocomplete ? autocompleteAdapter : []),
  ].join("\n");
};

const muiBoundComponents = (
  usage: KindUsage,
  withDescription = false,
): string => {
  const propsType = boundFieldProps(usage, withDescription);
  // With descriptions in play, the component takes over MUI's ONE helper-text
  // slot: the explicit helperText AFTER the adapter spread widens its
  // error-only value to `fieldError(field) ?? description` — the error keeps
  // the slot while present, the description shows otherwise.
  const spreadInput = (
    name: string,
    spread: string,
    fieldType: string,
    hoist: readonly string[],
  ): readonly string[] =>
    withDescription
      ? [
          "",
          `const ${name} = ({ form, path, label, description }: BoundFieldProps) => {`,
          `  const field = useField<${fieldType}>(form, path);`,
          ...hoist,
          "  return (",
          "    <TextField",
          "      fullWidth",
          "      label={label}",
          `      {...${spread}}`,
          "      helperText={fieldError(field) ?? description}",
          "    />",
          "  );",
          "};",
        ]
      : [
          "",
          `const ${name} = ({ form, path, label }: BoundFieldProps) => {`,
          `  const field = useField<${fieldType}>(form, path);`,
          ...hoist,
          `  return <TextField fullWidth label={label} {...${spread}} />;`,
        "};",
        ];
  const text = spreadInput(
    "BoundTextField",
    `${kitScalarBinding("mui", "string")}(field)`,
    "string | null | undefined",
    [],
  );
  const number = spreadInput(
    "BoundNumberField",
    "numberProps",
    "number | null | undefined",
    ["  const numberProps = useMuiNumberFieldProps(field);"],
  );
  const date = spreadInput(
    "BoundDateField",
    `${kitScalarBinding("mui", "date")}(field)`,
    "Date | null | undefined",
    [],
  );
  const select = [
    "",
    "const BoundSelectField = ({",
    "  form,",
    "  path,",
    "  label,",
    ...(withDescription ? ["  description,"] : []),
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    ...(withDescription
      ? [
          "    <TextField",
          "      select",
          "      fullWidth",
          "      label={label}",
          "      {...muiSelectProps(field)}",
          "      helperText={fieldError(field) ?? description}",
          "    >",
        ]
      : [
          "    <TextField select fullWidth label={label} {...muiSelectProps(field)}>",
        ]),
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
  // The autocomplete override control: MUI Autocomplete in freeSolo, bound
  // through the input value (see muiAutocompleteProps). label/error/helper
  // land on the inner TextField AFTER the params spread (params carries no
  // name/label/error keys, so nothing is clobbered); name keeps formstand's
  // focus helpers working through their name walk.
  const autocomplete = [
    "",
    "const BoundAutocompleteField = ({",
    "  form,",
    "  path,",
    "  label,",
    ...(withDescription ? ["  description,"] : []),
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    "    <Autocomplete",
    "      fullWidth",
    "      {...muiAutocompleteProps(field)}",
    "      options={options}",
    "      renderInput={(params) => (",
    "        <TextField",
    "          // The canonical MUI pattern. The cast is for @mui/material",
    "          // 5/6 only: their params typing (size, the legacy slot",
    "          // objects) trips exactOptionalPropertyTypes consumers; 7/9",
    "          // accept the spread as-is.",
    "          {...(params as unknown as TextFieldProps)}",
    "          label={label}",
    "          name={field.path}",
    "          error={fieldError(field) !== undefined}",
    withDescription
      ? "          helperText={fieldError(field) ?? description}"
      : "          helperText={fieldError(field)}",
    "        />",
    "      )}",
    "    />",
    "  );",
    "};",
  ];
  return [
    ...propsType,
    ...(usage.string ? text : []),
    ...(usage.number ? number : []),
    ...(usage.date ? date : []),
    ...(usage.enum ? select : []),
    ...(usage.boolean ? switchField : []),
    ...(usage.autocomplete ? autocomplete : []),
  ].join("\n");
};

const muiLeaf = boundLeaf("BoundSwitchField", describedLeafKinds("mui"));

// Typography renders section headings: any addressable object OR tuple field
// at any depth needs it, since both render backend.objectSection chrome
// (array sections are covered by the arrays.length check; unions render bare
// variant controls, no heading). Tuples missing here shipped a tuple-only
// root that emitted <Row>/<Col>/<Typography> without importing them.
const anyAddressableSectionField = (spec: FieldSpec): boolean => {
  switch (spec.kind) {
    case "object":
      return spec.fields.some(
        (field) =>
          !isUnaddressable(field.name) &&
          (field.spec.kind === "object" ||
            field.spec.kind === "tuple" ||
            anyAddressableSectionField(field.spec)),
      );
    case "array":
      return anyAddressableSectionField(spec.item);
    default:
      return false;
  }
};

const muiBackend = (
  visual: VisualOptions,
  version: MuiVersion,
  scaffold: ScaffoldOptions,
): Backend => {
  const cols = visual.columns;
  // Multi-column sections lay out with MUI's own <Grid> — the same
  // component the hand-written playground demos use — with the per-version
  // spelling from the config: v5's legacy item/xs/sm, v6+'s size objects.
  // fieldLines wraps each child via gridChild below, so sections no longer
  // self-span. The 1-column chrome keeps the historical Stack/CardContent
  // output verbatim.
  const { gridSizeProp } = muiVersionConfig(version);
  const colSm = String(12 / cols);
  const gridOpen = "<Grid container spacing={2}>";
  const itemCell: readonly [string, string] = gridSizeProp
    ? [`<Grid size={{ xs: 12, sm: ${colSm} }}>`, "</Grid>"]
    : [`<Grid item xs={12} sm={${colSm}}>`, "</Grid>"];
  const fullRowCell: readonly [string, string] = gridSizeProp
    ? ["<Grid size={12}>", "</Grid>"]
    : ["<Grid item xs={12}>", "</Grid>"];
  const titleCell = (level: number, label: string): readonly string[] => [
    `${ind(level)}${fullRowCell[0]}`,
    `${ind(level + 1)}<Typography variant="subtitle1">${jsxText(label)}</Typography>`,
    `${ind(level)}${fullRowCell[1]}`,
  ];
  const sectionOpen = (label: string, level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        return cols === 1
          ? [
              `${ind(level)}<Stack spacing={2}>`,
              `${ind(level + 1)}<Typography variant="subtitle1">${jsxText(label)}</Typography>`,
            ]
          : [`${ind(level)}${gridOpen}`, ...titleCell(level + 1, label)];
      case "panel":
        // Same chrome shape as the module layout's objectShell (which puts
        // the heading INSIDE the grid CardContent so it can carry the
        // dirty/valid flags) — the two emitters must not drift for the
        // same --sections flag.
        return cols === 1
          ? [
              `${ind(level)}<Card variant="outlined">`,
              `${ind(level + 1)}<CardContent sx={{ ${gridSxProps(1)} }}>`,
              `${ind(level + 2)}<Typography variant="subtitle1">${jsxText(label)}</Typography>`,
            ]
          : [
              `${ind(level)}<Card variant="outlined">`,
              `${ind(level + 1)}<CardContent>`,
              `${ind(level + 2)}${gridOpen}`,
              ...titleCell(level + 3, label),
            ];
      case "collapsible":
        return [
          `${ind(level)}<Accordion defaultExpanded variant="outlined" disableGutters>`,
          `${ind(level + 1)}<AccordionSummary expandIcon={<span aria-hidden>{"▾"}</span>}>`,
          `${ind(level + 2)}<Typography variant="subtitle1">${jsxText(label)}</Typography>`,
          `${ind(level + 1)}</AccordionSummary>`,
          ...(cols === 1
            ? [`${ind(level + 1)}<AccordionDetails sx={{ ${gridSxProps(1)} }}>`]
            : [
                `${ind(level + 1)}<AccordionDetails>`,
                `${ind(level + 2)}${gridOpen}`,
              ]),
        ];
    }
  };
  const sectionClose = (level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        return [`${ind(level)}${cols === 1 ? "</Stack>" : "</Grid>"}`];
      case "panel":
        return [
          ...(cols === 1 ? [] : [`${ind(level + 2)}</Grid>`]),
          `${ind(level + 1)}</CardContent>`,
          `${ind(level)}</Card>`,
        ];
      case "collapsible":
        return [
          ...(cols === 1 ? [] : [`${ind(level + 2)}</Grid>`]),
          `${ind(level + 1)}</AccordionDetails>`,
          `${ind(level)}</Accordion>`,
        ];
    }
  };
  // Depth of the chrome's innermost container beyond the section tag: flat
  // is the container itself; panel adds Card+CardContent (and the Grid at
  // cols > 1), collapsible AccordionDetails (+Grid) under the Accordion.
  const bodyDelta = visual.sections === "flat" ? 0 : cols === 1 ? 1 : 2;

  return {
  header: (usage, arrays, root) => {
    const hasSection = arrays.length > 0 || anyAddressableSectionField(root);
    const muiImports = [
      ...(hasSection && visual.sections === "collapsible"
        ? ["Accordion", "AccordionDetails", "AccordionSummary"]
        : []),
      ...(usage.autocomplete ? ["Autocomplete"] : []),
      "Box",
      // --live drops the submit button; arrays still render add/remove.
      ...(scaffold.live && arrays.length === 0 ? [] : ["Button"]),
      ...(hasSection && visual.sections === "panel"
        ? ["Card", "CardContent"]
        : []),
      ...(usage.boolean ? ["FormControlLabel"] : []),
      ...(hasSection && visual.columns > 1 ? ["Grid"] : []),
      ...(usage.enum ? ["MenuItem"] : []),
      "Stack",
      ...(usage.boolean ? ["Switch"] : []),
      // The autocomplete's renderInput is a TextField too (and casts its
      // params through the exported props type — see BoundAutocompleteField).
      ...(usage.string ||
      usage.date ||
      usage.number ||
      usage.enum ||
      usage.autocomplete
        ? ["TextField"]
        : []),
      ...(usage.autocomplete ? ["type TextFieldProps"] : []),
      ...(hasSection ? ["Typography"] : []),
    ];
    return [
      ...reactImportLines(true, usage.number, scaffold.live, usage.autocomplete),
      "import {",
      ...muiImports.map((name) => `  ${name},`),
      `} from "@mui/material";`,
      ...kitFormstandImportLines(usage, arrays, root, scaffold),
      `import { z } from "zod";`,
    ];
  },
  preamble: (usage, staticUsage, root) => [
    muiAdapterSection(usage, "", version),
    muiBoundComponents(staticUsage, hasStaticDescriptions(root)),
    "",
  ],
  leaf: muiLeaf,
  variantLeaf: muiVariantLeaf,
  numberPropsHook: kitScalarBinding("mui", "number"),
  objectSection: wrapSection(sectionOpen, sectionClose, bodyDelta),
  gridChild:
    cols === 1 ? undefined : { item: itemCell, fullRow: fullRowCell },
  arraySection: (entry, level, rowBody) => {
    // Children sit under the chrome's innermost container — same shift as
    // objectSection's body. At cols > 1 each row's Stack nests INSIDE its
    // wrapper cell (one deeper again), and the error/add pair sits inside
    // its spanning cell.
    const base = level + 1 + bodyDelta;
    const rowStack = cols === 1 ? base + 1 : base + 2;
    const spanBase = cols === 1 ? base : base + 1;
    return [
      ...sectionOpen(entry.label, level),
      // Grid children must be Grid items: each mapped row keeps the old
      // grid's two-up flow, the error and add button share a spanning cell.
      `${ind(base)}{${entry.hookName}.fields.map((row, index) => (`,
      ...(cols === 1
        ? [`${ind(rowStack)}<Stack`, `${ind(rowStack + 1)}key={row.id}`]
        : [
            `${ind(base + 1)}${
              gridSizeProp
                ? `<Grid key={row.id} size={{ xs: 12, sm: ${colSm} }}>`
                : `<Grid key={row.id} item xs={12} sm={${colSm}}>`
            }`,
            `${ind(rowStack)}<Stack`,
          ]),
      `${ind(rowStack + 1)}spacing={2}`,
      `${ind(rowStack + 1)}sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}`,
      `${ind(rowStack)}>`,
      ...shiftLines(rowBody, rowStack + 1 - (level + 3)),
      `${ind(rowStack + 1)}<Button type="button" onClick={() => ${entry.hookName}.remove(index)}>`,
      `${ind(rowStack + 2)}Remove`,
      `${ind(rowStack + 1)}</Button>`,
      `${ind(rowStack)}</Stack>`,
      ...(cols === 1 ? [] : [`${ind(base + 1)}${fullRowCell[1]}`]),
      `${ind(base)}))}`,
      // The array-level error (z.array().min(...) etc.) and the add button —
      // one spanning cell at cols > 1.
      ...(cols === 1 ? [] : [`${ind(base)}${fullRowCell[0]}`]),
      `${ind(spanBase)}{${entry.hookName}.error ? (`,
      `${ind(spanBase + 1)}<Typography role="alert" color="error">{${entry.hookName}.error[0]}</Typography>`,
      `${ind(spanBase)}) : null}`,
      `${ind(spanBase)}<Button type="button" onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}>`,
      `${ind(spanBase + 1)}${jsxText(`Add ${entry.label.toLowerCase()}`)}`,
      `${ind(spanBase)}</Button>`,
      ...(cols === 1 ? [] : [`${ind(base)}${fullRowCell[1]}`]),
      ...sectionClose(level),
    ];
  },
  bodyLevel: 4,
  formShell: {
    open: ["    <Box", `      component="form"`],
    afterSubmit: [
      "      sx={{ maxWidth: 640 }}",
      "    >",
      "      <Stack spacing={2}>",
    ],
    submitButton: [
      `        <Button type="submit" variant="contained" disabled={submitting}>`,
      `          {submitting ? "Submitting..." : "Submit"}`,
      "        </Button>",
    ],
    close: ["      </Stack>", "    </Box>"],
  },
  };
};

export const emitMuiForm = (options: EmitFormOptions): string =>
  emitForm(
    muiBackend(
      options.visual ?? DEFAULT_VISUAL,
      options.muiVersion ?? DEFAULT_MUI_VERSION,
      scaffoldOf(options),
    ),
    options,
  );

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
  const dateAdapter = [
    "",
    `${exp}const shadcnDateInputProps = <T extends Date | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  type: "date" as const,',
    "  name: field.path,",
    "  value: dateToInputText(field.value),",
    '  "aria-invalid": ariaInvalid(field),',
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => {",
    "    const parsed = parseDateText(e.target.value);",
    '    field.setValue((parsed.kind === "date" ? parsed.value : field.emptyValue) as T);',
    "  },",
    "  onBlur: field.onBlur,",
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
    // The autocomplete override binds the same text adapter — its
    // suggestions ride a native <datalist> on the Input.
    ...(usage.string || usage.autocomplete ? textAdapter : []),
    ...(usage.number ? numberAdapter : []),
    ...(usage.date ? dateAdapter : []),
    ...(usage.enum ? selectAdapter : []),
    ...(usage.boolean ? checkboxAdapter : []),
  ].join("\n");
};

const shadcnBoundComponents = (
  usage: KindUsage,
  withDescription = false,
): string => {
  const propsType = boundFieldProps(usage, withDescription);
  // The muted description line shares the under-control slot with the error
  // line — the error wins it while present (and an undescribed field renders
  // neither line, not an empty <p>).
  const params = withDescription
    ? "{ form, path, label, description }"
    : "{ form, path, label }";
  const descLines = withDescription
    ? [
        "      {fieldError(field) === undefined && description !== undefined ? (",
        '        <p className="text-sm text-muted-foreground">{description}</p>',
        "      ) : null}",
      ]
    : [];
  const text = [
    "",
    `const BoundTextField = (${params}: BoundFieldProps) => {`,
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    '    <div className="grid gap-2">',
    "      <Label htmlFor={path}>{label}</Label>",
    `      <Input id={path} {...${kitScalarBinding("shadcn", "string")}(field)} />`,
    ...descLines,
    "      <FieldError field={field} />",
    "    </div>",
    "  );",
    "};",
  ];
  const number = [
    "",
    `const BoundNumberField = (${params}: BoundFieldProps) => {`,
    "  const field = useField<number | null | undefined>(form, path);",
    "  return (",
    '    <div className="grid gap-2">',
    "      <Label htmlFor={path}>{label}</Label>",
    `      <Input id={path} {...${kitScalarBinding("shadcn", "number")}(field)} />`,
    ...descLines,
    "      <FieldError field={field} />",
    "    </div>",
    "  );",
    "};",
  ];
  const date = [
    "",
    `const BoundDateField = (${params}: BoundFieldProps) => {`,
    "  const field = useField<Date | null | undefined>(form, path);",
    "  return (",
    '    <div className="grid gap-2">',
    "      <Label htmlFor={path}>{label}</Label>",
    `      <Input id={path} {...${kitScalarBinding("shadcn", "date")}(field)} />`,
    ...descLines,
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
    ...(withDescription ? ["  description,"] : []),
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
    ...descLines,
    "      <FieldError field={field} />",
    "    </div>",
    "  );",
    "};",
  ];
  const checkbox = [
    "",
    `const BoundCheckboxField = (${params}: BoundFieldProps) => {`,
    "  const field = useField<boolean | null | undefined>(form, path);",
    "  return (",
    '    <div className="grid gap-2">',
    '      <div className="flex items-center gap-2">',
    "        <Checkbox id={path} {...shadcnCheckboxProps(field)} />",
    "        <Label htmlFor={path}>{label}</Label>",
    "      </div>",
    ...descLines,
    "      <FieldError field={field} />",
    "    </div>",
    "  );",
    "};",
  ];
  // The autocomplete override control: shadcn ships no installable combobox
  // (its combobox is a copy-paste recipe), so suggestions ride a native
  // <datalist> on the Input — DOM-shaped, zero new API surface, and the
  // field stays free text.
  const autocomplete = [
    "",
    "const BoundAutocompleteField = ({",
    "  form,",
    "  path,",
    "  label,",
    ...(withDescription ? ["  description,"] : []),
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    '    <div className="grid gap-2">',
    "      <Label htmlFor={path}>{label}</Label>",
    "      <Input id={path} list={`${path}-datalist`} {...shadcnTextInputProps(field)} />",
    "      <datalist id={`${path}-datalist`}>",
    "        {options.map((option) => (",
    "          <option key={option} value={option} />",
    "        ))}",
    "      </datalist>",
    ...descLines,
    "      <FieldError field={field} />",
    "    </div>",
    "  );",
    "};",
  ];
  return [
    ...propsType,
    ...(usage.string ? text : []),
    ...(usage.number ? number : []),
    ...(usage.date ? date : []),
    ...(usage.enum ? select : []),
    ...(usage.boolean ? checkbox : []),
    ...(usage.autocomplete ? autocomplete : []),
  ].join("\n");
};

const shadcnLeaf = boundLeaf("BoundCheckboxField", describedLeafKinds("shadcn"));

const shadcnBackend = (
  visual: VisualOptions,
  scaffold: ScaffoldOptions,
): Backend => {
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
  // Collapsible chrome interposes the grid div between the section tag and
  // its body; fieldset bodies are direct children (legend is a sibling).
  const bodyDelta = visual.sections === "collapsible" ? 1 : 0;

  return {
  header: (usage, arrays, root) => {
    const hasLeaf = hasLeafUsage(usage);
    return [
      // shadcn's number binding stays the stateless type="number" input, so
      // no useState import here. The autocomplete override binds the text
      // adapter, so it needs ChangeEvent (and Input) too.
      ...reactImportLines(
        usage.string || usage.date || usage.number || usage.autocomplete,
        false,
        scaffold.live,
      ),
      // --live drops the submit button; arrays still render add/remove.
      ...(scaffold.live && arrays.length === 0
        ? []
        : [`import { Button } from "@/components/ui/button";`]),
      ...(usage.boolean
        ? [`import { Checkbox } from "@/components/ui/checkbox";`]
        : []),
      ...(usage.string || usage.date || usage.number || usage.autocomplete
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
      ...kitFormstandImportLines(usage, arrays, root, scaffold),
      `import { z } from "zod";`,
    ];
  },
  preamble: (usage, staticUsage, root) => [
    shadcnAdapterSection(usage),
    shadcnBoundComponents(staticUsage, hasStaticDescriptions(root)),
    "",
  ],
  leaf: shadcnLeaf,
  variantLeaf: shadcnVariantLeaf,
  objectSection: wrapSection(sectionOpen, sectionClose, bodyDelta),
  arraySection: (entry, level, rowBody) => {
    // Rows sit under the chrome's innermost container (the collapsible grid
    // div), not under the section tag — same shift as objectSection's body.
    const base = level + 1 + bodyDelta;
    return [
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
      `${ind(base)}{${entry.hookName}.fields.map((row, index) => (`,
      `${ind(base + 1)}<div key={row.id} className="grid gap-4 rounded-lg border p-4">`,
      ...shiftLines(rowBody, bodyDelta),
      `${ind(base + 2)}<Button`,
      `${ind(base + 3)}type="button"`,
      `${ind(base + 3)}variant="outline"`,
      `${ind(base + 3)}size="sm"`,
      `${ind(base + 3)}className="w-fit"`,
      `${ind(base + 3)}onClick={() => ${entry.hookName}.remove(index)}`,
      `${ind(base + 2)}>`,
      `${ind(base + 3)}Remove`,
      `${ind(base + 2)}</Button>`,
      `${ind(base + 1)}</div>`,
      `${ind(base)}))}`,
      // The array-level error — the same line the module layout's list shell
      // renders.
      `${ind(base)}{${entry.hookName}.error ? <p role="alert">{${entry.hookName}.error[0]}</p> : null}`,
      `${ind(base)}<Button`,
      `${ind(base + 1)}type="button"`,
      `${ind(base + 1)}variant="outline"`,
      `${ind(base + 1)}size="sm"`,
      `${ind(base + 1)}className="w-fit"`,
      `${ind(base + 1)}onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}`,
      `${ind(base)}>`,
      `${ind(base + 1)}${jsxText(`Add ${entry.label.toLowerCase()}`)}`,
      `${ind(base)}</Button>`,
      ...(visual.sections === "collapsible"
        ? [`${ind(level + 1)}</div>`, `${ind(level)}</details>`]
        : [`${ind(level)}</section>`]),
    ];
  },
  bodyLevel: 3,
  formShell: {
    open: ["    <form", `      className="grid max-w-xl gap-4"`],
    afterSubmit: ["    >"],
    submitButton: [
      `      <Button type="submit" disabled={submitting}>`,
      `        {submitting ? "Submitting..." : "Submit"}`,
      "      </Button>",
    ],
    close: ["    </form>"],
  },
  };
};

export const emitShadcnForm = (options: EmitFormOptions): string =>
  emitForm(
    shadcnBackend(options.visual ?? DEFAULT_VISUAL, scaffoldOf(options)),
    options,
  );

// ---------------------------------------------------------------------------
// Chakra UI v3 backend (@chakra-ui/react 3, compound components)
// ---------------------------------------------------------------------------

// Emits against the Chakra 3 compound-component API (verified against the
// installed 3.36 .d.ts in cli/matrix): Field.Root/Field.Label/Field.ErrorText
// replace v2's FormControl trio (`invalid` on the root, not `isInvalid`);
// NativeSelect.Root + NativeSelect.Field bind a plain <select> (preferred
// over the Ark collection-based Select for generated code — it takes DOM
// change events like formstand's selectProps); Switch.Root is a <label>
// carrying checked/onCheckedChange (details.checked) with Switch.HiddenInput
// / Switch.Control / Switch.Thumb / Switch.Label inside. The generated file
// assumes the host app mounts ChakraProvider (same policy as the MUI
// backend, which assumes the kit's provider/theme at the root). Layout is
// style props (gap/display/gridTemplateColumns), not v2's `spacing`.

// The chakra spelling of the shared section grid, as literal JSX attributes
// (chakra style props). gap="4" is 1rem — the same 16px the other kits use.
// Style props take responsive objects, so the multi-column grid collapses to
// one column below md (768px) instead of squeezing inputs on a phone.
export const gridChakraProps = (columns: number): string =>
  `display="grid" gridTemplateColumns={{ base: "1fr", md: ${q(
    `repeat(${columns}, minmax(0, 1fr))`,
  )} }} gap="4"`;

export const chakraAdapterSection = (usage: KindUsage, exp = ""): string => {
  // Error text renders through Field.ErrorText, gated by `invalid` on
  // Field.Root — both read fieldError, so every non-boolean leaf needs it
  // (the Switch renders no error line, like the MUI backend's booleans).
  const needsError =
    usage.string ||
    usage.date ||
    usage.number ||
    usage.enum ||
    usage.autocomplete;
  const textAdapter = [
    "",
    `${exp}const chakraTextInputProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => {",
    "    const text = e.target.value;",
    '    field.setValue((text === "" && field.emptyValue === null ? null : text) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // A HOOK, not a builder: value/onChange/onBlur come from the raw-text
  // editing state (useNumberText), so typing "85000.50" or "-5" is never
  // reparsed into "8500050"/"5" mid-entry.
  const numberAdapter = [
    ...numberTextHook("HTMLInputElement"),
    "",
    `${exp}const useChakraNumberInputProps = <T extends number | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  inputMode: "decimal" as const,',
    "  name: field.path,",
    "  ...useNumberText(field),",
    "});",
  ];
  const dateAdapter = [
    "",
    `${exp}const chakraDateInputProps = <T extends Date | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  type: "date" as const,',
    "  name: field.path,",
    "  value: dateToInputText(field.value),",
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => {",
    "    const parsed = parseDateText(e.target.value);",
    '    field.setValue((parsed.kind === "date" ? parsed.value : field.emptyValue) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // NativeSelect.Field is a real <select>: DOM change events, no Radix-style
  // value callbacks.
  const selectAdapter = [
    "",
    `${exp}const chakraSelectProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  onChange: (e: ChangeEvent<HTMLSelectElement>) => {",
    "    const next = e.target.value;",
    '    field.setValue((next === "" && field.emptyValue === null ? null : next) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // Spread onto Switch.Root (the state lives there, not on the hidden
  // input); onBlur lands on the root <label> and catches the inner input's
  // blur as it bubbles.
  const switchAdapter = [
    "",
    `${exp}const chakraSwitchProps = <T extends boolean | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    "  checked: field.value ?? false,",
    "  onCheckedChange: (details: Readonly<{ checked: boolean }>) =>",
    "    field.setValue(details.checked as T),",
    "  onBlur: field.onBlur,",
    "});",
  ];
  return [
    "// ---- formstand → Chakra UI v3 adapter --------------------------------------",
    ...(needsError ? withExportPrefix(FIELD_ERROR_HELPER, exp) : []),
    // The autocomplete override binds the same text adapter — its
    // suggestions ride a native <datalist> on the Input (chakra's Combobox
    // is Ark's collection-API compound component; see the Bound component's
    // comment for why the DOM-shaped datalist is the generated binding).
    ...(usage.string || usage.autocomplete ? textAdapter : []),
    ...(usage.number ? numberAdapter : []),
    ...(usage.date ? dateAdapter : []),
    ...(usage.enum ? selectAdapter : []),
    ...(usage.boolean ? switchAdapter : []),
  ].join("\n");
};

const chakraBoundComponents = (
  usage: KindUsage,
  withDescription = false,
): string => {
  const propsType = boundFieldProps(usage, withDescription);
  // Field.HelperText fills the under-control slot only while Field.ErrorText
  // does not (chakra shows both otherwise — the swap is explicit), and an
  // undescribed field renders no empty helper element.
  const params = withDescription
    ? "{ form, path, label, description }"
    : "{ form, path, label }";
  const descLines = withDescription
    ? [
        "      {fieldError(field) === undefined && description !== undefined ? (",
        "        <Field.HelperText>{description}</Field.HelperText>",
        "      ) : null}",
      ]
    : [];
  const input = (builder: string, fieldType: string): readonly string[] => [
    "",
    `const Bound${builder === "chakraDateInputProps" ? "Date" : "Text"}Field = (${params}: BoundFieldProps) => {`,
    `  const field = useField<${fieldType}>(form, path);`,
    "  return (",
    "    <Field.Root invalid={fieldError(field) !== undefined}>",
    "      <Field.Label>{label}</Field.Label>",
    `      <Input {...${builder}(field)} />`,
    ...descLines,
    "      <Field.ErrorText>{fieldError(field)}</Field.ErrorText>",
    "    </Field.Root>",
    "  );",
    "};",
  ];
  // Number binds through the STATE-holding number hook, hoisted like any
  // other hook call.
  const number = [
    "",
    `const BoundNumberField = (${params}: BoundFieldProps) => {`,
    "  const field = useField<number | null | undefined>(form, path);",
    "  const numberProps = useChakraNumberInputProps(field);",
    "  return (",
    "    <Field.Root invalid={fieldError(field) !== undefined}>",
    "      <Field.Label>{label}</Field.Label>",
    "      <Input {...numberProps} />",
    ...descLines,
    "      <Field.ErrorText>{fieldError(field)}</Field.ErrorText>",
    "    </Field.Root>",
    "  );",
    "};",
  ];
  const select = [
    "",
    "const BoundSelectField = ({",
    "  form,",
    "  path,",
    "  label,",
    ...(withDescription ? ["  description,"] : []),
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    "    <Field.Root invalid={fieldError(field) !== undefined}>",
    "      <Field.Label>{label}</Field.Label>",
    "      <NativeSelect.Root>",
    "        <NativeSelect.Field",
    "          placeholder={`Select ${label.toLowerCase()}`}",
    "          {...chakraSelectProps(field)}",
    "        >",
    "          {options.map((option) => (",
    "            <option key={option} value={option}>",
    "              {option}",
    "            </option>",
    "          ))}",
    "        </NativeSelect.Field>",
    "        <NativeSelect.Indicator />",
    "      </NativeSelect.Root>",
    ...descLines,
    "      <Field.ErrorText>{fieldError(field)}</Field.ErrorText>",
    "    </Field.Root>",
    "  );",
    "};",
  ];
  const switchField = [
    "",
    "const BoundSwitchField = ({ form, path, label }: BoundFieldProps) => {",
    "  const field = useField<boolean | null | undefined>(form, path);",
    "  return (",
    "    <Switch.Root {...chakraSwitchProps(field)}>",
    "      <Switch.HiddenInput />",
    "      <Switch.Control>",
    "        <Switch.Thumb />",
    "      </Switch.Control>",
    "      <Switch.Label>{label}</Switch.Label>",
    "    </Switch.Root>",
    "  );",
    "};",
  ];
  // The autocomplete override control. Chakra 3's own Combobox is Ark's
  // collection-API compound component (createListCollection + Root/Control/
  // Input/Positioner/Content/Item and allowCustomValue for free text) — a
  // disproportionate surface for a faithful free-text-with-suggestions
  // binding in generated code — so suggestions ride a native <datalist> on
  // the plain Input instead: DOM-shaped, honest, and the field stays a
  // string the user can type freely.
  const autocomplete = [
    "",
    "const BoundAutocompleteField = ({",
    "  form,",
    "  path,",
    "  label,",
    ...(withDescription ? ["  description,"] : []),
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    "    <Field.Root invalid={fieldError(field) !== undefined}>",
    "      <Field.Label>{label}</Field.Label>",
    "      <Input list={`${path}-datalist`} {...chakraTextInputProps(field)} />",
    "      <datalist id={`${path}-datalist`}>",
    "        {options.map((option) => (",
    "          <option key={option} value={option} />",
    "        ))}",
    "      </datalist>",
    ...descLines,
    "      <Field.ErrorText>{fieldError(field)}</Field.ErrorText>",
    "    </Field.Root>",
    "  );",
    "};",
  ];
  return [
    ...propsType,
    ...(usage.string
      ? input(kitScalarBinding("chakra", "string"), "string | null | undefined")
      : []),
    ...(usage.number ? number : []),
    ...(usage.date
      ? input(kitScalarBinding("chakra", "date"), "Date | null | undefined")
      : []),
    ...(usage.enum ? select : []),
    ...(usage.boolean ? switchField : []),
    ...(usage.autocomplete ? autocomplete : []),
  ].join("\n");
};

// A control rendered from a bound field variable, using the in-file chakra
// adapter builders — the discriminant select and each variant field of a
// union (the path-typed Bound* components can't reach variant paths).
const chakraVariantLeaf = (
  spec: FieldSpec,
  fieldVar: string,
  label: string,
  level: number,
): readonly string[] => {
  // The inline Field.HelperText for a described variant field — rendered
  // only while Field.ErrorText is not (chakra shows both otherwise).
  const descLines =
    spec.description !== undefined
      ? [
          `${ind(level + 1)}{fieldError(${fieldVar}) === undefined ? (`,
          `${ind(level + 2)}<Field.HelperText>${jsxText(spec.description)}</Field.HelperText>`,
          `${ind(level + 1)}) : null}`,
        ]
      : [];
  switch (spec.kind) {
    case "boolean":
      return [
        `${ind(level)}<Switch.Root {...chakraSwitchProps(${fieldVar})}>`,
        `${ind(level + 1)}<Switch.HiddenInput />`,
        `${ind(level + 1)}<Switch.Control>`,
        `${ind(level + 2)}<Switch.Thumb />`,
        `${ind(level + 1)}</Switch.Control>`,
        `${ind(level + 1)}<Switch.Label>${jsxText(label)}</Switch.Label>`,
        `${ind(level)}</Switch.Root>`,
      ];
    case "enum":
      return [
        `${ind(level)}<Field.Root invalid={fieldError(${fieldVar}) !== undefined}>`,
        `${ind(level + 1)}<Field.Label>${jsxText(label)}</Field.Label>`,
        `${ind(level + 1)}<NativeSelect.Root>`,
        `${ind(level + 2)}<NativeSelect.Field ${jsxAttr("placeholder", `Select ${label.toLowerCase()}`)} {...chakraSelectProps(${fieldVar})}>`,
        ...spec.options.map(
          (option) =>
            `${ind(level + 3)}<option value=${jsxText(option)}>${jsxText(labelFromName(option))}</option>`,
        ),
        `${ind(level + 2)}</NativeSelect.Field>`,
        `${ind(level + 2)}<NativeSelect.Indicator />`,
        `${ind(level + 1)}</NativeSelect.Root>`,
        ...descLines,
        `${ind(level + 1)}<Field.ErrorText>{fieldError(${fieldVar})}</Field.ErrorText>`,
        `${ind(level)}</Field.Root>`,
      ];
    // Number props come from the hoisted `${var}NumberProps` const (see
    // unionHooks): the number binding is a STATE-holding hook, and hooks
    // can't be called inside the conditional variant blocks.
    case "number":
      return [
        `${ind(level)}<Field.Root invalid={fieldError(${fieldVar}) !== undefined}>`,
        `${ind(level + 1)}<Field.Label>${jsxText(label)}</Field.Label>`,
        `${ind(level + 1)}<Input {...${fieldVar}NumberProps} />`,
        ...descLines,
        `${ind(level + 1)}<Field.ErrorText>{fieldError(${fieldVar})}</Field.ErrorText>`,
        `${ind(level)}</Field.Root>`,
      ];
    case "string":
    case "date": {
      const builder = kitScalarBinding("chakra", spec.kind);
      return [
        `${ind(level)}<Field.Root invalid={fieldError(${fieldVar}) !== undefined}>`,
        `${ind(level + 1)}<Field.Label>${jsxText(label)}</Field.Label>`,
        `${ind(level + 1)}<Input {...${builder}(${fieldVar})} />`,
        ...descLines,
        `${ind(level + 1)}<Field.ErrorText>{fieldError(${fieldVar})}</Field.ErrorText>`,
        `${ind(level)}</Field.Root>`,
      ];
    }
    case "object":
    case "array":
    case "tuple":
    case "union":
      return [
        `${ind(level)}{/* unreachable: containers never bind as a variant field */}`,
      ];
  }
};

const chakraLeaf = boundLeaf("BoundSwitchField", describedLeafKinds("chakra"));

const chakraBackend = (
  visual: VisualOptions,
  scaffold: ScaffoldOptions,
): Backend => {
  const cols = visual.columns;
  // Every section container is a CSS grid via style props (a one-column grid
  // with gap "4" is exactly a Stack); section roots span the parent grid's
  // full row.
  const grid = gridChakraProps(cols);
  const span = cols > 1 ? ` gridColumn="1 / -1"` : "";
  const headingSpan = cols > 1 ? ` gridColumn="1 / -1"` : "";
  const sectionOpen = (label: string, level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        // The 1-column default reads as a Stack; multi-column flows a grid.
        return cols === 1
          ? [
              `${ind(level)}<Stack gap="4">`,
              `${ind(level + 1)}<Heading size="sm">${jsxText(label)}</Heading>`,
            ]
          : [
              `${ind(level)}<Box${span} ${grid}>`,
              `${ind(level + 1)}<Heading size="sm" gridColumn="1 / -1">${jsxText(label)}</Heading>`,
            ];
      case "panel":
        return [
          `${ind(level)}<Card.Root${span}>`,
          `${ind(level + 1)}<Card.Body ${grid}>`,
          `${ind(level + 2)}<Heading size="sm"${headingSpan}>${jsxText(label)}</Heading>`,
        ];
      case "collapsible":
        // One Accordion.Root per section (mirroring the MUI backend's one
        // Accordion per section); the item value is fixed and defaultValue
        // opens it, `collapsible` lets it close again.
        return [
          `${ind(level)}<Accordion.Root collapsible defaultValue={["section"]}${span}>`,
          `${ind(level + 1)}<Accordion.Item value="section">`,
          `${ind(level + 2)}<Accordion.ItemTrigger>`,
          `${ind(level + 3)}<Heading size="sm">${jsxText(label)}</Heading>`,
          `${ind(level + 3)}<Accordion.ItemIndicator />`,
          `${ind(level + 2)}</Accordion.ItemTrigger>`,
          `${ind(level + 2)}<Accordion.ItemContent>`,
          `${ind(level + 3)}<Accordion.ItemBody ${grid}>`,
        ];
    }
  };
  const sectionClose = (level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        return [`${ind(level)}${cols === 1 ? "</Stack>" : "</Box>"}`];
      case "panel":
        return [`${ind(level + 1)}</Card.Body>`, `${ind(level)}</Card.Root>`];
      case "collapsible":
        return [
          `${ind(level + 3)}</Accordion.ItemBody>`,
          `${ind(level + 2)}</Accordion.ItemContent>`,
          `${ind(level + 1)}</Accordion.Item>`,
          `${ind(level)}</Accordion.Root>`,
        ];
    }
  };
  // Depth of the chrome's innermost container beyond the section tag: flat
  // Stack/Box is the container itself; panel adds Card.Body; collapsible
  // nests Item > ItemContent > ItemBody under the Root.
  const bodyDelta =
    visual.sections === "flat" ? 0 : visual.sections === "panel" ? 1 : 3;

  return {
  header: (usage, arrays, root) => {
    const hasSection = arrays.length > 0 || anyAddressableSectionField(root);
    const chakraImports = [
      ...(hasSection && visual.sections === "collapsible" ? ["Accordion"] : []),
      "Box",
      // --live drops the submit button; arrays still render add/remove.
      ...(scaffold.live && arrays.length === 0 ? [] : ["Button"]),
      ...(hasSection && visual.sections === "panel" ? ["Card"] : []),
      // Field.Root/Label/ErrorText wrap every non-boolean control (static
      // Bound* components and union controls alike, the autocomplete
      // override included).
      ...(usage.string ||
      usage.date ||
      usage.number ||
      usage.enum ||
      usage.autocomplete
        ? ["Field"]
        : []),
      ...(hasSection ? ["Heading"] : []),
      ...(usage.string || usage.date || usage.number || usage.autocomplete
        ? ["Input"]
        : []),
      ...(usage.enum ? ["NativeSelect"] : []),
      "Stack",
      ...(usage.boolean ? ["Switch"] : []),
      // Text renders each array's list-level error line.
      ...(arrays.length > 0 ? ["Text"] : []),
    ];
    return [
      // The Switch adapter's onCheckedChange is a details callback, so only
      // the DOM-event adapters need ChangeEvent (the autocomplete override
      // rides the text adapter).
      ...reactImportLines(
        usage.string ||
          usage.date ||
          usage.number ||
          usage.enum ||
          usage.autocomplete,
        usage.number,
        scaffold.live,
      ),
      "import {",
      ...chakraImports.map((name) => `  ${name},`),
      `} from "@chakra-ui/react";`,
      ...kitFormstandImportLines(usage, arrays, root, scaffold),
      `import { z } from "zod";`,
    ];
  },
  preamble: (usage, staticUsage, root) => [
    chakraAdapterSection(usage),
    chakraBoundComponents(staticUsage, hasStaticDescriptions(root)),
    "",
  ],
  leaf: chakraLeaf,
  variantLeaf: chakraVariantLeaf,
  numberPropsHook: kitScalarBinding("chakra", "number"),
  objectSection: wrapSection(sectionOpen, sectionClose, bodyDelta),
  arraySection: (entry, level, rowBody) => {
    // Children sit under the chrome's innermost container — same shift as
    // objectSection's body.
    const base = level + 1 + bodyDelta;
    return [
      ...sectionOpen(entry.label, level),
      `${ind(base)}{${entry.hookName}.fields.map((row, index) => (`,
      `${ind(base + 1)}<Stack`,
      `${ind(base + 2)}key={row.id}`,
      `${ind(base + 2)}gap="4"`,
      `${ind(base + 2)}p="4"`,
      `${ind(base + 2)}borderWidth="1px"`,
      `${ind(base + 2)}borderRadius="md"`,
      `${ind(base + 1)}>`,
      ...shiftLines(rowBody, bodyDelta),
      `${ind(base + 2)}<Button type="button" variant="outline" size="sm" onClick={() => ${entry.hookName}.remove(index)}>`,
      `${ind(base + 3)}Remove`,
      `${ind(base + 2)}</Button>`,
      `${ind(base + 1)}</Stack>`,
      `${ind(base)}))}`,
      // The array-level error — the same per-kit line the module layout's
      // list shell renders.
      `${ind(base)}{${entry.hookName}.error ? (`,
      `${ind(base + 1)}<Text role="alert" color="red.500">{${entry.hookName}.error[0]}</Text>`,
      `${ind(base)}) : null}`,
      `${ind(base)}<Button type="button" variant="outline" size="sm" onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}>`,
      `${ind(base + 1)}${jsxText(`Add ${entry.label.toLowerCase()}`)}`,
      `${ind(base)}</Button>`,
      ...sectionClose(level),
    ];
  },
  bodyLevel: 4,
  formShell: {
    open: ["    <Box", `      as="form"`],
    afterSubmit: [`      maxW="640px"`, "    >", `      <Stack gap="4">`],
    submitButton: [
      `        <Button type="submit" disabled={submitting}>`,
      `          {submitting ? "Submitting..." : "Submit"}`,
      "        </Button>",
    ],
    close: ["      </Stack>", "    </Box>"],
  },
  };
};

export const emitChakraForm = (options: EmitFormOptions): string =>
  emitForm(
    chakraBackend(options.visual ?? DEFAULT_VISUAL, scaffoldOf(options)),
    options,
  );

// ---------------------------------------------------------------------------
// Mantine backend (@mantine/core 9)
// ---------------------------------------------------------------------------

// Emits against the current @mantine/core major (verified against the
// installed 9.5 .d.ts in cli/matrix). Mantine field components carry their
// own label + error props, so there is no Field wrapper: TextInput binds
// text/number/date natively (its onChange is a DOM ChangeEvent — Mantine's
// NumberInput is deliberately NOT used, its onChange takes
// `(value: number | string)`, not an event, so it can't share formstand's
// input-shaped adapters); NativeSelect is a real <select> (DOM change
// events, like the chakra backend's NativeSelect.Field); Switch's onChange
// is a DOM ChangeEvent<HTMLInputElement> with `checked` on the target.
// Sections render Stack/Title (flat), Card + SimpleGrid (panel), or
// Accordion/Accordion.Item/Control/Panel (collapsible); columns use
// SimpleGrid cols={N}. The generated file assumes the host app mounts
// MantineProvider (same policy as the mui and chakra backends).

export const mantineAdapterSection = (usage: KindUsage, exp = ""): string => {
  // The error line renders through each control's own `error` prop, so the
  // builders embed `error: fieldError(field)` — every non-boolean leaf needs
  // the helper (the Switch renders no error line, like the other backends'
  // booleans).
  const needsError =
    usage.string ||
    usage.date ||
    usage.number ||
    usage.enum ||
    usage.autocomplete;
  const textAdapter = [
    "",
    `${exp}const mantineTextInputProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  error: fieldError(field),",
    "  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {",
    "    const text = e.target.value;",
    '    field.setValue((text === "" && field.emptyValue === null ? null : text) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // TextInput with inputMode="decimal": the native binding. Mantine's
  // NumberInput widget is not DOM-shaped (onChange: (value: number | string))
  // — the plain input keeps the adapter identical in spirit to the other
  // kits. A HOOK, not a builder: value/onChange/onBlur come from the
  // raw-text editing state (useNumberText), so typing "85000.50" or "-5" is
  // never reparsed into "8500050"/"5" mid-entry.
  const numberAdapter = [
    ...numberTextHook("HTMLInputElement | HTMLTextAreaElement"),
    "",
    `${exp}const useMantineNumberInputProps = <T extends number | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  inputMode: "decimal" as const,',
    "  name: field.path,",
    "  error: fieldError(field),",
    "  ...useNumberText(field),",
    "});",
  ];
  const dateAdapter = [
    "",
    `${exp}const mantineDateInputProps = <T extends Date | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  type: "date" as const,',
    "  name: field.path,",
    "  value: dateToInputText(field.value),",
    "  error: fieldError(field),",
    "  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {",
    "    const parsed = parseDateText(e.target.value);",
    '    field.setValue((parsed.kind === "date" ? parsed.value : field.emptyValue) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // NativeSelect renders a real <select>: DOM change events, options as
  // children (the `data` prop is ignored when children are passed).
  const selectAdapter = [
    "",
    `${exp}const mantineSelectProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  error: fieldError(field),",
    "  onChange: (e: ChangeEvent<HTMLSelectElement>) => {",
    "    const next = e.target.value;",
    '    field.setValue((next === "" && field.emptyValue === null ? null : next) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  const switchAdapter = [
    "",
    `${exp}const mantineSwitchProps = <T extends boolean | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    "  checked: field.value ?? false,",
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => field.setValue(e.target.checked as T),",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // Free text with suggestions (config-fields autocomplete override):
  // Mantine's Autocomplete is exactly that semantic — value: string,
  // onChange: (value: string) => void, the list only suggests. The data
  // prop stays at the call site (per-field), everything else binds here.
  const autocompleteAdapter = [
    "",
    `${exp}const mantineAutocompleteProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  error: fieldError(field),",
    "  onChange: (value: string) => {",
    '    field.setValue((value === "" && field.emptyValue === null ? null : value) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  return [
    "// ---- formstand → Mantine adapter -------------------------------------------",
    ...(needsError ? withExportPrefix(FIELD_ERROR_HELPER, exp) : []),
    ...(usage.string ? textAdapter : []),
    ...(usage.number ? numberAdapter : []),
    ...(usage.date ? dateAdapter : []),
    ...(usage.enum ? selectAdapter : []),
    ...(usage.boolean ? switchAdapter : []),
    ...(usage.autocomplete ? autocompleteAdapter : []),
  ].join("\n");
};

const mantineBoundComponents = (
  usage: KindUsage,
  withDescription = false,
): string => {
  const propsType = boundFieldProps(usage, withDescription);
  // Mantine's native `description` slot: its own element, separate from the
  // `error` slot the adapter builders fill — Mantine renders both when both
  // exist, so no swap is emitted (the kit-idiomatic behavior).
  const params = withDescription
    ? "{ form, path, label, description }"
    : "{ form, path, label }";
  const descAttr = withDescription ? " description={description}" : "";
  const input = (
    name: string,
    builder: string,
    fieldType: string,
  ): readonly string[] => [
    "",
    `const ${name} = (${params}: BoundFieldProps) => {`,
    `  const field = useField<${fieldType}>(form, path);`,
    `  return <TextInput label={label}${descAttr} {...${builder}(field)} />;`,
    "};",
  ];
  const select = [
    "",
    "const BoundSelectField = ({",
    "  form,",
    "  path,",
    "  label,",
    ...(withDescription ? ["  description,"] : []),
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    `    <NativeSelect label={label}${descAttr} {...mantineSelectProps(field)}>`,
    "      <option value=\"\">{`Select ${label.toLowerCase()}`}</option>",
    "      {options.map((option) => (",
    "        <option key={option} value={option}>",
    "          {option}",
    "        </option>",
    "      ))}",
    "    </NativeSelect>",
    "  );",
    "};",
  ];
  const switchField = [
    "",
    `const BoundSwitchField = (${params}: BoundFieldProps) => {`,
    "  const field = useField<boolean | null | undefined>(form, path);",
    `  return <Switch label={label}${descAttr} {...mantineSwitchProps(field)} />;`,
    "};",
  ];
  // Number binds through the STATE-holding number hook, hoisted like any
  // other hook call.
  const number = [
    "",
    `const BoundNumberField = (${params}: BoundFieldProps) => {`,
    "  const field = useField<number | null | undefined>(form, path);",
    "  const numberProps = useMantineNumberInputProps(field);",
    `  return <TextInput label={label}${descAttr} {...numberProps} />;`,
    "};",
  ];
  // The autocomplete override control: Mantine's own Autocomplete (free
  // text with suggestions — its native semantic), the options threaded as
  // `data` (Mantine accepts readonly arrays).
  const autocomplete = [
    "",
    "const BoundAutocompleteField = ({",
    "  form,",
    "  path,",
    "  label,",
    ...(withDescription ? ["  description,"] : []),
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    `    <Autocomplete label={label}${descAttr} data={options} {...mantineAutocompleteProps(field)} />`,
    "  );",
    "};",
  ];
  return [
    ...propsType,
    ...(usage.string
      ? input(
          "BoundTextField",
          kitScalarBinding("mantine", "string"),
          "string | null | undefined",
        )
      : []),
    ...(usage.number ? number : []),
    ...(usage.date
      ? input(
          "BoundDateField",
          kitScalarBinding("mantine", "date"),
          "Date | null | undefined",
        )
      : []),
    ...(usage.enum ? select : []),
    ...(usage.boolean ? switchField : []),
    ...(usage.autocomplete ? autocomplete : []),
  ].join("\n");
};

// A control rendered from a bound field variable, using the in-file mantine
// adapter builders — the discriminant select and each variant field of a
// union (the path-typed Bound* components can't reach variant paths).
const mantineVariantLeaf = (
  spec: FieldSpec,
  fieldVar: string,
  label: string,
  level: number,
): readonly string[] => {
  // Mantine's native description slot, inlined as a literal — separate from
  // the error slot, so no swap (see mantineBoundComponents).
  const descAttr =
    spec.description !== undefined
      ? ` ${jsxAttr("description", spec.description)}`
      : "";
  switch (spec.kind) {
    case "boolean":
      return [
        `${ind(level)}<Switch ${jsxAttr("label", label)}${descAttr} {...mantineSwitchProps(${fieldVar})} />`,
      ];
    case "enum":
      return [
        `${ind(level)}<NativeSelect ${jsxAttr("label", label)}${descAttr} {...mantineSelectProps(${fieldVar})}>`,
        `${ind(level + 1)}<option value="">${jsxText(`Select ${label.toLowerCase()}`)}</option>`,
        ...spec.options.map(
          (option) =>
            `${ind(level + 1)}<option value=${jsxText(option)}>${jsxText(labelFromName(option))}</option>`,
        ),
        `${ind(level)}</NativeSelect>`,
      ];
    // Number props come from the hoisted `${var}NumberProps` const (see
    // unionHooks): the number binding is a STATE-holding hook, and hooks
    // can't be called inside the conditional variant blocks.
    case "number":
      return [
        `${ind(level)}<TextInput ${jsxAttr("label", label)}${descAttr} {...${fieldVar}NumberProps} />`,
      ];
    case "string":
    case "date": {
      const builder = kitScalarBinding("mantine", spec.kind);
      return [
        `${ind(level)}<TextInput ${jsxAttr("label", label)}${descAttr} {...${builder}(${fieldVar})} />`,
      ];
    }
    case "object":
    case "array":
    case "tuple":
    case "union":
      return [
        `${ind(level)}{/* unreachable: containers never bind as a variant field */}`,
      ];
  }
};

const mantineLeaf = boundLeaf("BoundSwitchField", describedLeafKinds("mantine"));

const mantineBackend = (
  visual: VisualOptions,
  scaffold: ScaffoldOptions,
): Backend => {
  const cols = visual.columns;
  // Multi-column sections lay out with Mantine's own <Grid>/<Grid.Col>
  // (12-column spans, responsive span objects) — SimpleGrid was the earlier
  // spelling, but it has no per-child span, and Grid.Col is what makes a
  // future per-field span a one-prop change. fieldLines wraps each child
  // via gridChild below, so sections no longer self-span.
  const colSm = String(12 / cols);
  const gridOpen = "<Grid>";
  const titleCol = (level: number, label: string): readonly string[] => [
    `${ind(level)}<Grid.Col span={12}>`,
    `${ind(level + 1)}<Title order={4}>${jsxText(label)}</Title>`,
    `${ind(level)}</Grid.Col>`,
  ];
  const sectionOpen = (label: string, level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        // The 1-column default reads as a Stack; multi-column flows a Grid.
        return cols === 1
          ? [
              `${ind(level)}<Stack gap="md">`,
              `${ind(level + 1)}<Title order={4}>${jsxText(label)}</Title>`,
            ]
          : [`${ind(level)}${gridOpen}`, ...titleCol(level + 1, label)];
      case "panel":
        return cols === 1
          ? [
              `${ind(level)}<Card withBorder>`,
              `${ind(level + 1)}<Stack gap="md">`,
              `${ind(level + 2)}<Title order={4}>${jsxText(label)}</Title>`,
            ]
          : [
              `${ind(level)}<Card withBorder>`,
              `${ind(level + 1)}${gridOpen}`,
              ...titleCol(level + 2, label),
            ];
      case "collapsible":
        // One Accordion per section (mirroring the MUI backend); the item
        // value is fixed and defaultValue opens it (single mode closes on a
        // second click, no `collapsible` flag needed).
        return [
          `${ind(level)}<Accordion defaultValue="section" variant="contained">`,
          `${ind(level + 1)}<Accordion.Item value="section">`,
          `${ind(level + 2)}<Accordion.Control>`,
          `${ind(level + 3)}<Title order={4}>${jsxText(label)}</Title>`,
          `${ind(level + 2)}</Accordion.Control>`,
          `${ind(level + 2)}<Accordion.Panel>`,
          `${ind(level + 3)}${cols === 1 ? `<Stack gap="md">` : gridOpen}`,
        ];
    }
  };
  const sectionClose = (level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        return [`${ind(level)}${cols === 1 ? "</Stack>" : "</Grid>"}`];
      case "panel":
        return [
          `${ind(level + 1)}${cols === 1 ? "</Stack>" : "</Grid>"}`,
          `${ind(level)}</Card>`,
        ];
      case "collapsible":
        return [
          `${ind(level + 3)}${cols === 1 ? "</Stack>" : "</Grid>"}`,
          `${ind(level + 2)}</Accordion.Panel>`,
          `${ind(level + 1)}</Accordion.Item>`,
          `${ind(level)}</Accordion>`,
        ];
    }
  };
  // Depth of the chrome's innermost container beyond the section tag: flat
  // Stack/Grid is the container itself; panel adds it under the Card;
  // collapsible nests Item > Panel > Stack/Grid under the Accordion.
  const bodyDelta =
    visual.sections === "flat" ? 0 : visual.sections === "panel" ? 1 : 3;

  return {
  header: (usage, arrays, root) => {
    const hasSection = arrays.length > 0 || anyAddressableSectionField(root);
    const mantineImports = [
      ...(hasSection && visual.sections === "collapsible" ? ["Accordion"] : []),
      ...(usage.autocomplete ? ["Autocomplete"] : []),
      "Box",
      // --live drops the submit button; arrays still render add/remove.
      ...(scaffold.live && arrays.length === 0 ? [] : ["Button"]),
      ...(hasSection && visual.sections === "panel" ? ["Card"] : []),
      ...(usage.enum ? ["NativeSelect"] : []),
      // Grid/Grid.Col lay out every multi-column section; the 1-column
      // chrome is a Stack in all three section styles.
      ...(hasSection && cols > 1 ? ["Grid"] : []),
      "Stack",
      ...(usage.boolean ? ["Switch"] : []),
      // Text renders each array's list-level error line.
      ...(arrays.length > 0 ? ["Text"] : []),
      ...(usage.string || usage.date || usage.number ? ["TextInput"] : []),
      ...(hasSection ? ["Title"] : []),
    ];
    return [
      // Every DOM-shaped mantine adapter (the Switch's included) types its
      // onChange with a ChangeEvent; only the autocomplete override is
      // value-shaped, so it alone pulls no ChangeEvent in.
      ...reactImportLines(
        usage.string ||
          usage.date ||
          usage.number ||
          usage.enum ||
          usage.boolean,
        usage.number,
        scaffold.live,
      ),
      "import {",
      ...mantineImports.map((name) => `  ${name},`),
      `} from "@mantine/core";`,
      ...kitFormstandImportLines(usage, arrays, root, scaffold),
      `import { z } from "zod";`,
    ];
  },
  preamble: (usage, staticUsage, root) => [
    mantineAdapterSection(usage),
    mantineBoundComponents(staticUsage, hasStaticDescriptions(root)),
    "",
  ],
  leaf: mantineLeaf,
  variantLeaf: mantineVariantLeaf,
  numberPropsHook: kitScalarBinding("mantine", "number"),
  gridChild:
    cols === 1
      ? undefined
      : {
          item: [`<Grid.Col span={{ base: 12, sm: ${colSm} }}>`, "</Grid.Col>"],
          fullRow: ["<Grid.Col span={12}>", "</Grid.Col>"],
        },
  objectSection: wrapSection(sectionOpen, sectionClose, bodyDelta),
  arraySection: (entry, level, rowBody) => {
    // Children sit under the chrome's innermost container — same shift as
    // objectSection's body. At cols > 1 each row's Stack nests INSIDE its
    // wrapper Col (one deeper again), and the error/add pair sits inside
    // its spanning Col.
    const base = level + 1 + bodyDelta;
    const rowStack = cols === 1 ? base + 1 : base + 2;
    const spanBase = cols === 1 ? base : base + 1;
    return [
      ...sectionOpen(entry.label, level),
      // Grid children must be Grid.Cols: each mapped row keeps the old
      // grid's two-up flow, the error and add button share a spanning Col.
      `${ind(base)}{${entry.hookName}.fields.map((row, index) => (`,
      ...(cols === 1
        ? [`${ind(rowStack)}<Stack`, `${ind(rowStack + 1)}key={row.id}`]
        : [
            `${ind(base + 1)}<Grid.Col key={row.id} span={{ base: 12, sm: ${colSm} }}>`,
            `${ind(rowStack)}<Stack`,
          ]),
      `${ind(rowStack + 1)}gap="md"`,
      `${ind(rowStack + 1)}p="md"`,
      `${ind(rowStack + 1)}bd="1px solid gray.3"`,
      `${ind(rowStack + 1)}bdrs="md"`,
      `${ind(rowStack)}>`,
      ...shiftLines(rowBody, rowStack + 1 - (level + 3)),
      `${ind(rowStack + 1)}<Button type="button" variant="outline" size="sm" onClick={() => ${entry.hookName}.remove(index)}>`,
      `${ind(rowStack + 2)}Remove`,
      `${ind(rowStack + 1)}</Button>`,
      `${ind(rowStack)}</Stack>`,
      ...(cols === 1 ? [] : [`${ind(base + 1)}</Grid.Col>`]),
      `${ind(base)}))}`,
      // The array-level error and add button — one spanning Col at cols > 1.
      ...(cols === 1 ? [] : [`${ind(base)}<Grid.Col span={12}>`]),
      `${ind(spanBase)}{${entry.hookName}.error ? (`,
      `${ind(spanBase + 1)}<Text role="alert" c="red">{${entry.hookName}.error[0]}</Text>`,
      `${ind(spanBase)}) : null}`,
      `${ind(spanBase)}<Button type="button" variant="outline" size="sm" onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}>`,
      `${ind(spanBase + 1)}${jsxText(`Add ${entry.label.toLowerCase()}`)}`,
      `${ind(spanBase)}</Button>`,
      ...(cols === 1 ? [] : [`${ind(base)}</Grid.Col>`]),
      ...sectionClose(level),
    ];
  },
  bodyLevel: 4,
  formShell: {
    open: ["    <Box", `      component="form"`],
    afterSubmit: ["      maw={640}", "    >", `      <Stack gap="md">`],
    submitButton: [
      `        <Button type="submit" disabled={submitting}>`,
      `          {submitting ? "Submitting..." : "Submit"}`,
      "        </Button>",
    ],
    close: ["      </Stack>", "    </Box>"],
  },
  };
};

export const emitMantineForm = (options: EmitFormOptions): string =>
  emitForm(
    mantineBackend(options.visual ?? DEFAULT_VISUAL, scaffoldOf(options)),
    options,
  );

// ---------------------------------------------------------------------------
// Ant Design backend (antd 6)
// ---------------------------------------------------------------------------

// Emits against antd 6 (verified against the installed 6.5 .d.ts in
// cli/matrix). The one hard rule: antd's own Form (Form.Item, name-based
// bindings, its own store) is never emitted — formstand owns state, so the
// generated code binds antd's INPUT components as controlled components:
//
// - Input is DOM-shaped (it extends InputHTMLAttributes), so text/number/
//   date bind natively — number as Input inputMode="decimal" (antd's
//   InputNumber is rejected on evidence: its onChange is
//   (value: number | null), not an event) and date as Input type="date"
//   (antd's DatePicker is dayjs-value-based, and the generated code pulls
//   no date library).
// - Select is a combobox with NO native-<select> sibling anywhere in antd,
//   so the enum binding is the backend's one value-shaped adapter:
//   onChange receives the selected value directly, value ?? null shows the
//   placeholder, and there is no `name` (antd's Select renders no
//   form-posting input).
// - Checkbox binds booleans: its onChange is antd's own DOM-ish
//   CheckboxChangeEvent (e.target.checked) and it has a real onBlur —
//   unlike antd's Switch, which has NO onBlur prop at all and a
//   value-shaped (checked, event) onChange, so Switch is rejected.
// - Without Form.Item there is no built-in error slot: every non-boolean
//   control paints `status="error"` and renders an explicit
//   Typography.Text type="danger" line (the plain backend's error line, in
//   antd's dialect), with a plain <label htmlFor>/id pair for the label.
//
// Sections render Flex/Typography.Title (flat), Card variant="outlined"
// (panel), or Collapse via the items API (collapsible — children-panels
// are deprecated in 5.x+); grids are style-prop CSS grids (gridStyleProps,
// like the plain backend). No provider is required (ConfigProvider is
// optional theming), and antd 6 peers react >=18 — no React-19 patch.

export const antdAdapterSection = (usage: KindUsage, exp = ""): string => {
  // Error text renders through the explicit FieldError line and `status`
  // paints the control; both read fieldError, so every non-boolean leaf
  // needs the helpers (Checkbox renders no error line, like the other
  // backends' booleans).
  const needsError =
    usage.string ||
    usage.date ||
    usage.number ||
    usage.enum ||
    usage.autocomplete;
  const errorHelper = [
    ...FIELD_ERROR_HELPER,
    "",
    `${exp}const fieldStatus = (`,
    "  field: Readonly<{ error: readonly string[] | undefined }>,",
    // "" (not undefined) is antd's own no-status value in the InputStatus
    // union — returning undefined would fail host apps compiled with
    // exactOptionalPropertyTypes, where `status?: InputStatus` rejects an
    // explicit undefined.
    '): "error" | "" => (fieldError(field) !== undefined ? "error" : "");',
    "",
    `${exp}const FieldError = ({`,
    "  field,",
    "}: Readonly<{",
    "  field: Readonly<{ error: readonly string[] | undefined }>;",
    "}>) => {",
    "  const message = fieldError(field);",
    "  return message !== undefined ? (",
    '    <Typography.Text role="alert" type="danger">',
    "      {message}",
    "    </Typography.Text>",
    "  ) : null;",
    "};",
  ];
  const textAdapter = [
    "",
    `${exp}const antdTextInputProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    '  value: field.value ?? "",',
    "  status: fieldStatus(field),",
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => {",
    "    const text = e.target.value;",
    '    field.setValue((text === "" && field.emptyValue === null ? null : text) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // Input with inputMode="decimal": the native binding. antd's InputNumber
  // widget is not DOM-shaped (onChange: (value: number | null)) — the plain
  // input keeps the adapter identical in spirit to the other kits. A HOOK,
  // not a builder: value/onChange/onBlur come from the raw-text editing
  // state (useNumberText), so typing "85000.50" or "-5" is never reparsed
  // into "8500050"/"5" mid-entry.
  const numberAdapter = [
    ...numberTextHook("HTMLInputElement"),
    "",
    `${exp}const useAntdNumberInputProps = <T extends number | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  inputMode: "decimal" as const,',
    "  name: field.path,",
    "  status: fieldStatus(field),",
    "  ...useNumberText(field),",
    "});",
  ];
  const dateAdapter = [
    "",
    `${exp}const antdDateInputProps = <T extends Date | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  type: "date" as const,',
    "  name: field.path,",
    "  value: dateToInputText(field.value),",
    "  status: fieldStatus(field),",
    "  onChange: (e: ChangeEvent<HTMLInputElement>) => {",
    "    const parsed = parseDateText(e.target.value);",
    '    field.setValue((parsed.kind === "date" ? parsed.value : field.emptyValue) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // The one value-shaped adapter: antd's Select is a combobox (no native
  // <select> exists in antd), so onChange receives the value directly.
  // value ?? null (not "") keeps the placeholder visible when empty, and
  // there is no `name` — antd's Select renders no form-posting input.
  // Because of that, formstand's focus helpers can't reach it through their
  // name walk: on formstand >= 0.11.0, focusField/focusFirstError fall back
  // to the element whose `id` is exactly the path (the generated markup
  // sets id={path}, which antd forwards to its real combobox input); on
  // 0.10.x and older, selects are simply skipped by the focus helpers.
  const selectAdapter = [
    "",
    "// No `name`: antd's Select renders no form-posting input. formstand's",
    "// focus helpers reach it anyway on formstand >= 0.11.0 — their",
    "// [id=path] fallback finds the combobox through the id={path} the",
    "// markup sets (antd forwards it to the real input); on 0.10.x and",
    "// older, focusField/focusFirstError skip selects.",
    `${exp}const antdSelectProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  value: field.value ?? null,",
    "  status: fieldStatus(field),",
    "  onChange: (value: string) => field.setValue(value as T),",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // Checkbox, not Switch: antd's Switch has no onBlur prop and a
  // value-shaped (checked, event) onChange; Checkbox speaks antd's DOM-ish
  // CheckboxChangeEvent (e.target.checked) and blurs like an input.
  const checkboxAdapter = [
    "",
    `${exp}const antdCheckboxProps = <T extends boolean | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    "  name: field.path,",
    "  checked: field.value ?? false,",
    "  onChange: (e: CheckboxChangeEvent) => field.setValue(e.target.checked as T),",
    "  onBlur: field.onBlur,",
    "});",
  ];
  // Free text with suggestions (config-fields autocomplete override):
  // antd's AutoComplete is value-shaped exactly like its Select (onChange
  // receives the string directly), but the value is the free TEXT, so ""
  // (not null) is the empty state. Same no-name caveat as the Select: no
  // form-posting input, so the markup sets id={path} for the focus-helper
  // fallback.
  const autocompleteAdapter = [
    "",
    "// No `name`: antd's AutoComplete renders no form-posting input.",
    "// formstand's focus helpers reach it anyway on formstand >= 0.11.0 —",
    "// their [id=path] fallback finds the combobox through the id={path}",
    "// the markup sets (antd forwards it to the real input); on 0.10.x and",
    "// older, focusField/focusFirstError skip it.",
    `${exp}const antdAutoCompleteProps = <T extends string | null | undefined>(`,
    "  field: UseFieldReturn<T>,",
    ") => ({",
    '  value: field.value ?? "",',
    "  status: fieldStatus(field),",
    "  onChange: (value: string) => {",
    '    field.setValue((value === "" && field.emptyValue === null ? null : value) as T);',
    "  },",
    "  onBlur: field.onBlur,",
    "});",
  ];
  return [
    "// ---- formstand → Ant Design adapter ----------------------------------------",
    ...(needsError ? withExportPrefix(errorHelper, exp) : []),
    ...(usage.string ? textAdapter : []),
    ...(usage.number ? numberAdapter : []),
    ...(usage.date ? dateAdapter : []),
    ...(usage.enum ? selectAdapter : []),
    ...(usage.boolean ? checkboxAdapter : []),
    ...(usage.autocomplete ? autocompleteAdapter : []),
  ].join("\n");
};

const antdBoundComponents = (
  usage: KindUsage,
  withDescription = false,
): string => {
  const propsType = boundFieldProps(usage, withDescription);
  // The muted Typography.Text description line shares the under-control slot
  // with the explicit FieldError line — the error wins it while present (and
  // an undescribed field renders neither).
  const params = withDescription
    ? "{ form, path, label, description }"
    : "{ form, path, label }";
  const descLines = withDescription
    ? [
        "      {fieldError(field) === undefined && description !== undefined ? (",
        '        <Typography.Text type="secondary">{description}</Typography.Text>',
        "      ) : null}",
      ]
    : [];
  const input = (
    name: string,
    builder: string,
    fieldType: string,
  ): readonly string[] => [
    "",
    `const ${name} = (${params}: BoundFieldProps) => {`,
    `  const field = useField<${fieldType}>(form, path);`,
    "  return (",
    '    <Flex vertical gap="small">',
    "      <label htmlFor={path}>{label}</label>",
    `      <Input id={path} {...${builder}(field)} />`,
    ...descLines,
    "      <FieldError field={field} />",
    "    </Flex>",
    "  );",
    "};",
  ];
  const select = [
    "",
    "const BoundSelectField = ({",
    "  form,",
    "  path,",
    "  label,",
    ...(withDescription ? ["  description,"] : []),
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    '    <Flex vertical gap="small">',
    "      <label htmlFor={path}>{label}</label>",
    "      <Select",
    "        id={path}",
    "        placeholder={`Select ${label.toLowerCase()}`}",
    "        options={options.map((option) => ({ value: option, label: option }))}",
    "        {...antdSelectProps(field)}",
    "      />",
    ...descLines,
    "      <FieldError field={field} />",
    "    </Flex>",
    "  );",
    "};",
  ];
  const checkbox = [
    "",
    "const BoundCheckboxField = ({ form, path, label }: BoundFieldProps) => {",
    "  const field = useField<boolean | null | undefined>(form, path);",
    "  return <Checkbox {...antdCheckboxProps(field)}>{label}</Checkbox>;",
    "};",
  ];
  // Number binds through the STATE-holding number hook, hoisted like any
  // other hook call.
  const number = [
    "",
    `const BoundNumberField = (${params}: BoundFieldProps) => {`,
    "  const field = useField<number | null | undefined>(form, path);",
    "  const numberProps = useAntdNumberInputProps(field);",
    "  return (",
    '    <Flex vertical gap="small">',
    "      <label htmlFor={path}>{label}</label>",
    "      <Input id={path} {...numberProps} />",
    ...descLines,
    "      <FieldError field={field} />",
    "    </Flex>",
    "  );",
    "};",
  ];
  // The autocomplete override control: antd's AutoComplete, options mapped
  // to its { value } shape at the call site, the explicit label/FieldError
  // lines from the established antd pattern (no Form.Item — formstand owns
  // the state), id={path} for the focus-helper fallback (see the adapter's
  // no-name comment).
  const autocomplete = [
    "",
    "const BoundAutocompleteField = ({",
    "  form,",
    "  path,",
    "  label,",
    ...(withDescription ? ["  description,"] : []),
    "  options,",
    "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
    "  const field = useField<string | null | undefined>(form, path);",
    "  return (",
    '    <Flex vertical gap="small">',
    "      <label htmlFor={path}>{label}</label>",
    "      <AutoComplete",
    "        id={path}",
    "        options={options.map((option) => ({ value: option }))}",
    "        {...antdAutoCompleteProps(field)}",
    "      />",
    ...descLines,
    "      <FieldError field={field} />",
    "    </Flex>",
    "  );",
    "};",
  ];
  return [
    ...propsType,
    ...(usage.string
      ? input(
          "BoundTextField",
          kitScalarBinding("antd", "string"),
          "string | null | undefined",
        )
      : []),
    ...(usage.number ? number : []),
    ...(usage.date
      ? input(
          "BoundDateField",
          kitScalarBinding("antd", "date"),
          "Date | null | undefined",
        )
      : []),
    ...(usage.enum ? select : []),
    ...(usage.boolean ? checkbox : []),
    ...(usage.autocomplete ? autocomplete : []),
  ].join("\n");
};

// A control rendered from a bound field variable, using the in-file antd
// adapter builders — the discriminant select and each variant field of a
// union (the path-typed Bound* components can't reach variant paths).
const antdVariantLeaf = (
  spec: FieldSpec,
  fieldVar: string,
  label: string,
  level: number,
): readonly string[] => {
  const id = `{${fieldVar}.path}`;
  // The muted description line for a described variant field — rendered only
  // while the FieldError line is not (the two share the one slot).
  const descLines =
    spec.description !== undefined
      ? [
          `${ind(level + 1)}{fieldError(${fieldVar}) === undefined ? (`,
          `${ind(level + 2)}<Typography.Text type="secondary">${jsxText(spec.description)}</Typography.Text>`,
          `${ind(level + 1)}) : null}`,
        ]
      : [];
  switch (spec.kind) {
    case "boolean":
      return [
        `${ind(level)}<Checkbox {...antdCheckboxProps(${fieldVar})}>${jsxText(label)}</Checkbox>`,
      ];
    case "enum":
      return [
        `${ind(level)}<Flex vertical gap="small">`,
        `${ind(level + 1)}<label htmlFor=${id}>${jsxText(label)}</label>`,
        `${ind(level + 1)}<Select`,
        `${ind(level + 2)}id=${id}`,
        `${ind(level + 2)}${jsxAttr("placeholder", `Select ${label.toLowerCase()}`)}`,
        `${ind(level + 2)}options={[`,
        ...spec.options.map(
          (option) =>
            `${ind(level + 3)}{ value: ${q(option)}, label: ${q(labelFromName(option))} },`,
        ),
        `${ind(level + 2)}]}`,
        `${ind(level + 2)}{...antdSelectProps(${fieldVar})}`,
        `${ind(level + 1)}/>`,
        ...descLines,
        `${ind(level + 1)}<FieldError field={${fieldVar}} />`,
        `${ind(level)}</Flex>`,
      ];
    // Number props come from the hoisted `${var}NumberProps` const (see
    // unionHooks): the number binding is a STATE-holding hook, and hooks
    // can't be called inside the conditional variant blocks.
    case "number":
      return [
        `${ind(level)}<Flex vertical gap="small">`,
        `${ind(level + 1)}<label htmlFor=${id}>${jsxText(label)}</label>`,
        `${ind(level + 1)}<Input id=${id} {...${fieldVar}NumberProps} />`,
        ...descLines,
        `${ind(level + 1)}<FieldError field={${fieldVar}} />`,
        `${ind(level)}</Flex>`,
      ];
    case "string":
    case "date": {
      const builder = kitScalarBinding("antd", spec.kind);
      return [
        `${ind(level)}<Flex vertical gap="small">`,
        `${ind(level + 1)}<label htmlFor=${id}>${jsxText(label)}</label>`,
        `${ind(level + 1)}<Input id=${id} {...${builder}(${fieldVar})} />`,
        ...descLines,
        `${ind(level + 1)}<FieldError field={${fieldVar}} />`,
        `${ind(level)}</Flex>`,
      ];
    }
    case "object":
    case "array":
    case "tuple":
    case "union":
      return [
        `${ind(level)}{/* unreachable: containers never bind as a variant field */}`,
      ];
  }
};

const antdLeaf = boundLeaf("BoundCheckboxField", describedLeafKinds("antd"));

const antdBackend = (
  visual: VisualOptions,
  scaffold: ScaffoldOptions,
): Backend => {
  const cols = visual.columns;
  // Multi-column sections lay out with antd's own Row/Col (24-column span
  // math, responsive props) — the kit's idiom, and what makes per-field
  // spans a Col prop later. An earlier revision used the plain backend's
  // CSS grid here; Row/Col replaced it when --columns went responsive.
  // fieldLines wraps each child via gridChild below, so sections no longer
  // self-span: their wrapper Col owns the row.
  const colSm = String(24 / cols);
  const rowOpen = `<Row gutter={[16, 16]}>`;
  const titleCol = (level: number, label: string): readonly string[] => [
    `${ind(level)}<Col span={24}>`,
    `${ind(level + 1)}<Typography.Title level={5}>${jsxText(label)}</Typography.Title>`,
    `${ind(level)}</Col>`,
  ];
  const sectionOpen = (label: string, level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        // The 1-column default reads as a vertical Flex; multi-column flows
        // a Row of Cols.
        return cols === 1
          ? [
              `${ind(level)}<Flex vertical gap="middle">`,
              `${ind(level + 1)}<Typography.Title level={5}>${jsxText(label)}</Typography.Title>`,
            ]
          : [`${ind(level)}${rowOpen}`, ...titleCol(level + 1, label)];
      case "panel":
        return cols === 1
          ? [
              `${ind(level)}<Card variant="outlined">`,
              `${ind(level + 1)}<Flex vertical gap="middle">`,
              `${ind(level + 2)}<Typography.Title level={5}>${jsxText(label)}</Typography.Title>`,
            ]
          : [
              `${ind(level)}<Card variant="outlined">`,
              `${ind(level + 1)}${rowOpen}`,
              ...titleCol(level + 2, label),
            ];
      case "collapsible":
        // One Collapse per section (mirroring the MUI backend), via the
        // items API — children-panels are deprecated in antd 5.x+.
        return [
          `${ind(level)}<Collapse`,
          `${ind(level + 1)}defaultActiveKey={["section"]}`,
          `${ind(level + 1)}items={[`,
          `${ind(level + 2)}{`,
          `${ind(level + 3)}key: "section",`,
          `${ind(level + 3)}label: <Typography.Title level={5}>${jsxText(label)}</Typography.Title>,`,
          `${ind(level + 3)}children: (`,
          `${ind(level + 4)}${cols === 1 ? `<Flex vertical gap="middle">` : rowOpen}`,
        ];
    }
  };
  const sectionClose = (level: number): readonly string[] => {
    switch (visual.sections) {
      case "flat":
        return [`${ind(level)}${cols === 1 ? "</Flex>" : "</Row>"}`];
      case "panel":
        return [
          `${ind(level + 1)}${cols === 1 ? "</Flex>" : "</Row>"}`,
          `${ind(level)}</Card>`,
        ];
      case "collapsible":
        return [
          `${ind(level + 4)}${cols === 1 ? "</Flex>" : "</Row>"}`,
          `${ind(level + 3)}),`,
          `${ind(level + 2)}},`,
          `${ind(level + 1)}]}`,
          `${ind(level)}/>`,
        ];
    }
  };
  // Depth of the chrome's innermost container beyond the section tag: flat
  // Flex/Row is the container itself; panel adds it under the Card;
  // collapsible reaches it through the items array's children expression.
  const bodyDelta =
    visual.sections === "flat" ? 0 : visual.sections === "panel" ? 1 : 4;

  return {
  header: (usage, arrays, root) => {
    const hasSection = arrays.length > 0 || anyAddressableSectionField(root);
    const needsError =
      usage.string ||
      usage.date ||
      usage.number ||
      usage.enum ||
      usage.autocomplete;
    const antdImports = [
      ...(usage.autocomplete ? ["AutoComplete"] : []),
      // --live drops the submit button; arrays still render add/remove.
      ...(scaffold.live && arrays.length === 0 ? [] : ["Button"]),
      ...(hasSection && visual.sections === "panel" ? ["Card"] : []),
      ...(usage.boolean ? ["Checkbox"] : []),
      ...(hasSection && visual.sections === "collapsible" ? ["Collapse"] : []),
      ...(hasSection && visual.columns > 1 ? ["Col"] : []),
      // Flex is the stack primitive: the form body always, non-boolean
      // leaves for their label/control/error column.
      "Flex",
      ...(hasSection && visual.columns > 1 ? ["Row"] : []),
      ...(usage.string || usage.date || usage.number ? ["Input"] : []),
      ...(usage.enum ? ["Select"] : []),
      // Typography.Title heads sections; Typography.Text renders the
      // explicit error line (no Form.Item means no built-in error slot)
      // and each array's list-level error.
      ...(hasSection || needsError ? ["Typography"] : []),
    ];
    return [
      // Select's adapter is value-shaped and Checkbox speaks antd's own
      // CheckboxChangeEvent, so only the Input adapters need ChangeEvent.
      ...reactImportLines(
        usage.string || usage.date || usage.number,
        usage.number,
        scaffold.live,
      ),
      "import {",
      ...antdImports.map((name) => `  ${name},`),
      ...(usage.boolean ? ["  type CheckboxChangeEvent,"] : []),
      `} from "antd";`,
      ...kitFormstandImportLines(usage, arrays, root, scaffold),
      `import { z } from "zod";`,
    ];
  },
  preamble: (usage, staticUsage, root) => [
    antdAdapterSection(usage),
    antdBoundComponents(staticUsage, hasStaticDescriptions(root)),
    "",
  ],
  leaf: antdLeaf,
  variantLeaf: antdVariantLeaf,
  numberPropsHook: kitScalarBinding("antd", "number"),
  gridChild:
    cols === 1
      ? undefined
      : {
          item: [`<Col xs={24} sm={${colSm}}>`, "</Col>"],
          fullRow: ["<Col span={24}>", "</Col>"],
        },
  objectSection: wrapSection(sectionOpen, sectionClose, bodyDelta),
  arraySection: (entry, level, rowBody) => {
    // Children sit under the chrome's innermost container — same shift as
    // objectSection's body. At cols > 1 each row's Flex nests INSIDE its
    // wrapper Col (one deeper again), and the error/add pair sits inside
    // its spanning Col.
    const base = level + 1 + bodyDelta;
    const rowStack = cols === 1 ? base + 1 : base + 2;
    const spanBase = cols === 1 ? base : base + 1;
    return [
      ...sectionOpen(entry.label, level),
      // Row children must be Cols: each mapped row keeps the old grid's
      // two-up flow via the same xs/sm split, the error and add-button span.
      `${ind(base)}{${entry.hookName}.fields.map((row, index) => (`,
      ...(cols === 1
        ? [`${ind(rowStack)}<Flex`, `${ind(rowStack + 1)}key={row.id}`]
        : [
            `${ind(base + 1)}<Col key={row.id} xs={24} sm={${colSm}}>`,
            `${ind(rowStack)}<Flex`,
          ]),
      `${ind(rowStack + 1)}vertical`,
      `${ind(rowStack + 1)}gap="middle"`,
      `${ind(rowStack + 1)}style={{ border: "1px solid #d9d9d9", borderRadius: 8, padding: 16 }}`,
      `${ind(rowStack)}>`,
      ...shiftLines(rowBody, rowStack + 1 - (level + 3)),
      `${ind(rowStack + 1)}<Button htmlType="button" size="small" onClick={() => ${entry.hookName}.remove(index)}>`,
      `${ind(rowStack + 2)}Remove`,
      `${ind(rowStack + 1)}</Button>`,
      `${ind(rowStack)}</Flex>`,
      ...(cols === 1 ? [] : [`${ind(base + 1)}</Col>`]),
      `${ind(base)}))}`,
      // The array-level error and add button — Row children must be Cols, so
      // at cols > 1 both ride one spanning Col.
      ...(cols === 1 ? [] : [`${ind(base)}<Col span={24}>`]),
      `${ind(spanBase)}{${entry.hookName}.error ? (`,
      `${ind(spanBase + 1)}<Typography.Text role="alert" type="danger">`,
      `${ind(spanBase + 2)}{${entry.hookName}.error[0]}`,
      `${ind(spanBase + 1)}</Typography.Text>`,
      `${ind(spanBase)}) : null}`,
      `${ind(spanBase)}<Button htmlType="button" size="small" onClick={() => ${entry.hookName}.push(${entry.emptyItemName})}>`,
      `${ind(spanBase + 1)}${jsxText(`Add ${entry.label.toLowerCase()}`)}`,
      `${ind(spanBase)}</Button>`,
      ...(cols === 1 ? [] : [`${ind(base)}</Col>`]),
      ...sectionClose(level),
    ];
  },
  bodyLevel: 4,
  formShell: {
    open: ["    <form"],
    afterSubmit: [
      "      style={{ maxWidth: 640 }}",
      "    >",
      `      <Flex vertical gap="middle">`,
    ],
    submitButton: [
      `        <Button htmlType="submit" type="primary" disabled={submitting}>`,
      `          {submitting ? "Submitting..." : "Submit"}`,
      "        </Button>",
    ],
    close: ["      </Flex>", "    </form>"],
  },
  };
};

export const emitAntdForm = (options: EmitFormOptions): string =>
  emitForm(
    antdBackend(options.visual ?? DEFAULT_VISUAL, scaffoldOf(options)),
    options,
  );

// ---------------------------------------------------------------------------
// Custom template backend (leaf-override for an arbitrary UI kit)
// ---------------------------------------------------------------------------

// A template owns only per-kind field rendering; the engine owns the skeleton.
// So the template backend extends the PLAIN scaffold (sections, arrays, form
// chrome, initial values) and overrides just the header imports, the Bound*
// wrapper preamble, the static leaf, and the union variant leaf. A kind the
// template doesn't list falls back to plain's raw controls.

// The useField<T> value type a Bound* wrapper binds, per scalar kind.
const TEMPLATE_FIELD_TYPE: Readonly<Record<TemplateLeafKind, string>> = {
  string: "string | null | undefined",
  number: "number | null | undefined",
  boolean: "boolean | null | undefined",
  date: "Date | null | undefined",
  enum: "string | null | undefined",
};

// The generated wrapper name per kind — also the element boundLeaf emits, so
// the leaf and the preamble agree. boundLeaf's boolean element is parameterized
// (below), the rest are fixed.
const TEMPLATE_BOUND_COMPONENT: Readonly<Record<TemplateLeafKind, string>> = {
  string: "BoundTextField",
  number: "BoundNumberField",
  date: "BoundDateField",
  boolean: "BoundBooleanField",
  enum: "BoundSelectField",
};

// Flatten a leaf renderer's output (a single string or an array of lines) to
// lines, splitting any embedded newlines so each is indented in turn.
const templateLeafLines = (
  output: string | readonly string[],
): readonly string[] =>
  (typeof output === "string" ? [output] : output).flatMap((line) =>
    line.split("\n"),
  );

// The default leaf for a kind the template DOESN'T override: plain's raw
// controls (input/select bound through the formstand prop builders), driven
// off the same pre-formatted LeafContext strings so the one function slots into
// both the Bound wrapper (label/options are props) and the union variant
// (label a quoted literal, options an array literal) paths unchanged. Enum
// renders its options at runtime via `.map` — like the kit Bound selects — so
// the `options` expression works whether it's a prop or a literal.
const plainTemplateLeaf = (ctx: TemplateLeafContext): readonly string[] => {
  const error = [
    `  {${ctx.field}.error?.[0] !== undefined ? (`,
    `    <p role="alert">{${ctx.field}.error?.[0]}</p>`,
    `  ) : null}`,
  ];
  // The always-visible muted helper line (plain's separate-slot policy — see
  // plainLeaf). ctx.description may be a per-field-optional prop reference,
  // so the emitted markup guards undefined at runtime.
  const desc =
    ctx.description === ""
      ? []
      : [
          `  {${ctx.description} !== undefined ? (`,
          `    <p className="zf-help">{${ctx.description}}</p>`,
          `  ) : null}`,
        ];
  switch (ctx.kind) {
    case "boolean":
      return [
        `<div className="zf-field">`,
        `  <label className="zf-label">`,
        `    <input {...${ctx.bind}} /> {${ctx.label}}`,
        `  </label>`,
        ...desc,
        ...error,
        `</div>`,
      ];
    case "enum":
      return [
        `<div className="zf-field">`,
        `  <label className="zf-label">{${ctx.label}}</label>`,
        `  <select {...${ctx.bind}}>`,
        `    <option value="">{"Select…"}</option>`,
        `    {${ctx.options}.map((option) => (`,
        `      <option key={option} value={option}>`,
        `        {option}`,
        `      </option>`,
        `    ))}`,
        `  </select>`,
        ...desc,
        ...error,
        `</div>`,
      ];
    default:
      return [
        `<div className="zf-field">`,
        `  <label className="zf-label">{${ctx.label}}</label>`,
        `  <input {...${ctx.bind}} />`,
        ...desc,
        ...error,
        `</div>`,
      ];
  }
};

// The leaf body for a kind: the template's own renderer, or the plain
// fallback — the ONE place the choice is made, so the wrapper and variant
// paths render the same kind identically.
const templateLeafBody = (
  template: Template,
  ctx: TemplateLeafContext,
): readonly string[] => {
  const render = template.leaf[ctx.kind];
  return render === undefined
    ? plainTemplateLeaf(ctx)
    : templateLeafLines(render(ctx));
};

// One Bound<Kind>Field wrapper: binds useField at `path`, then renders the
// kind's leaf body with a context whose label (and enum options) are the
// wrapper's own props.
const templateBoundComponent = (
  template: Template,
  kind: TemplateLeafKind,
  withDescription: boolean,
): readonly string[] => {
  const ctx: TemplateLeafContext = {
    kind,
    field: "field",
    bind: `${PLAIN_BUILDER[kind]}(field)`,
    label: "label",
    options: kind === "enum" ? "options" : "",
    // Inside the wrapper the description is the (optional) prop — present on
    // BoundFieldProps only when the schema carries static descriptions.
    description: withDescription ? "description" : "",
  };
  const params = withDescription
    ? "{ form, path, label, description }"
    : "{ form, path, label }";
  const signature =
    kind === "enum"
      ? [
          `const ${TEMPLATE_BOUND_COMPONENT[kind]} = ({`,
          "  form,",
          "  path,",
          "  label,",
          ...(withDescription ? ["  description,"] : []),
          "  options,",
          "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
        ]
      : [
          `const ${TEMPLATE_BOUND_COMPONENT[kind]} = (${params}: BoundFieldProps) => {`,
        ];
  return [
    "",
    ...signature,
    `  const field = useField<${TEMPLATE_FIELD_TYPE[kind]}>(form, path);`,
    "  return (",
    ...templateLeafBody(template, ctx).map((line) => `    ${line}`),
    "  );",
    "};",
  ];
};

// The autocomplete-override wrapper for the template backend. Overrides WIN
// over the template: a template owns per-KIND rendering, and an overridden
// field opted out of its kind's default — so the override emission (plain's
// input + native <datalist>) applies, not template.leaf.string. Unlike
// plain's own AutocompleteField, the description arrives as a prop (the
// boundLeaf path passes it), rendered in plain's separate zf-help slot.
const templateAutocompleteComponent = (
  withDescription: boolean,
): readonly string[] => [
  "",
  "// autocomplete override: the config-fields override wins over the",
  "// template's per-kind renderers — plain input + native <datalist>.",
  "const BoundAutocompleteField = ({",
  "  form,",
  "  path,",
  "  label,",
  ...(withDescription ? ["  description,"] : []),
  "  options,",
  "}: BoundFieldProps & Readonly<{ options: readonly string[] }>) => {",
  "  const field = useField<string | null | undefined>(form, path);",
  "  return (",
  '    <div className="zf-field">',
  '      <label className="zf-label">',
  "        {label}",
  "        <input list={`${path}-datalist`} {...textInputProps(field)} />",
  "      </label>",
  "      <datalist id={`${path}-datalist`}>",
  "        {options.map((option) => (",
  "          <option key={option} value={option} />",
  "        ))}",
  "      </datalist>",
  ...(withDescription
    ? [
        "      {description !== undefined ? (",
        '        <p className="zf-help">{description}</p>',
        "      ) : null}",
      ]
    : []),
  "      {field.error?.[0] !== undefined ? (",
  '        <p role="alert">{field.error?.[0]}</p>',
  "      ) : null}",
  "    </div>",
  "  );",
  "};",
];

// The wrapper components, one per kind that renders as a STATIC leaf (gated on
// static-leaf usage like the kit backends' Bound components — a union-only kind
// renders from a hoisted hook and needs no wrapper).
const templateBoundComponents = (
  template: Template,
  staticUsage: KindUsage,
  withDescription: boolean,
): string =>
  [
    ...boundFieldProps(staticUsage, withDescription),
    ...(staticUsage.string
      ? templateBoundComponent(template, "string", withDescription)
      : []),
    ...(staticUsage.number
      ? templateBoundComponent(template, "number", withDescription)
      : []),
    ...(staticUsage.date
      ? templateBoundComponent(template, "date", withDescription)
      : []),
    ...(staticUsage.enum
      ? templateBoundComponent(template, "enum", withDescription)
      : []),
    ...(staticUsage.boolean
      ? templateBoundComponent(template, "boolean", withDescription)
      : []),
    ...(staticUsage.autocomplete
      ? templateAutocompleteComponent(withDescription)
      : []),
  ].join("\n");

// A variant control (the discriminant select or a union variant field):
// renders the SAME leaf body as the wrapper, but from the already-hoisted
// field VARIABLE, with the label as a quoted literal and enum options as an
// array literal — the pre-formatted strings are what let one leaf function
// serve both contexts.
const templateVariantLeaf =
  (template: Template): Backend["variantLeaf"] =>
  (spec, fieldVar, label, level) => {
    if (
      spec.kind === "object" ||
      spec.kind === "array" ||
      spec.kind === "tuple" ||
      spec.kind === "union"
    ) {
      return [
        `${ind(level)}{/* unreachable: containers never bind as a variant field */}`,
      ];
    }
    const ctx: TemplateLeafContext = {
      kind: spec.kind,
      field: fieldVar,
      bind: `${PLAIN_BUILDER[spec.kind]}(${fieldVar})`,
      label: q(label),
      options:
        spec.kind === "enum" ? `[${spec.options.map(q).join(", ")}]` : "",
      // Inside a union block the description is its quoted literal.
      description: spec.description === undefined ? "" : q(spec.description),
    };
    return templateLeafBody(template, ctx).map(
      (line) => `${ind(level)}${line}`,
    );
  };

// Merge the template's import lines by module specifier, deduping names and
// keeping first-seen order — `type Foo` names pass through verbatim.
const mergeTemplateImports = (
  imports: readonly TemplateImport[],
): readonly TemplateImport[] =>
  imports.reduce<readonly TemplateImport[]>((acc, line) => {
    const names = line.names.filter(
      (name, i) => line.names.indexOf(name) === i,
    );
    const existing = acc.find((entry) => entry.from === line.from);
    return existing === undefined
      ? [...acc, { from: line.from, names }]
      : acc.map((entry) =>
          entry.from === line.from
            ? {
                from: entry.from,
                names: [
                  ...entry.names,
                  ...names.filter((name) => !entry.names.includes(name)),
                ],
              }
            : entry,
        );
  }, []);

const templateImportLines = (
  imports: readonly TemplateImport[],
): readonly string[] =>
  mergeTemplateImports(imports).flatMap((line) =>
    line.names.length === 0
      ? []
      : [`import { ${line.names.join(", ")} } from ${q(line.from)};`],
  );

// The template backend: plain's scaffold with the leaf rendering replaced by
// the template's controls — wrapped in Bound* components for static fields,
// inlined from hoisted hooks for union variants — and unlisted kinds falling
// back to plain's raw controls.
const templateBackend = (
  template: Template,
  visual: VisualOptions,
  scaffold: ScaffoldOptions,
): Backend => {
  const plain = plainBackend(visual, scaffold);
  return {
    ...plain,
    header: (usage, arrays, root) => {
      const staticUsage = collectStaticUsage(root);
      const hasStaticLeaf = hasLeafUsage(staticUsage);
      // Every rendered kind — a static wrapper OR a union control — binds
      // through the plain prop builder, so the builder imports track TOTAL
      // usage (not just the union-control usage the plain backend gates on).
      const builderImports = [
        // The autocomplete override binds textInputProps too (dedupe when
        // plain strings are also present).
        ...(usage.string || usage.autocomplete ? ["textInputProps"] : []),
        ...(usage.number ? ["numberInputProps"] : []),
        ...(usage.date ? ["dateInputProps"] : []),
        ...(usage.boolean ? ["checkboxProps"] : []),
        ...(usage.enum ? ["selectProps"] : []),
      ];
      const formstandValueImports = [
        ...builderImports,
        ...(arrays.length > 0 ? ["useFieldArray"] : []),
        // useField backs both the Bound wrappers and the union discriminant/
        // common-field hooks.
        ...(hasStaticLeaf || usage.union ? ["useField"] : []),
        ...(hasVariantFieldUsage(root) ? ["useVariantField"] : []),
        "useForm",
        ...(scaffold.live ? [] : ["useIsSubmitting"]),
      ];
      // FieldFormApi is referenced only by BoundFieldProps (the wrappers).
      const formstandTypeImports = hasStaticLeaf ? ["FieldFormApi"] : [];
      return [
        ...reactImportLines(false, false, scaffold.live),
        `import { z } from "zod";`,
        ...templateImportLines(template.imports ?? []),
        "import {",
        ...formstandValueImports.map((name) => `  ${name},`),
        ...formstandTypeImports.map((name) => `  type ${name},`),
        `} from "formstand";`,
      ];
    },
    preamble: (_usage, staticUsage, root) => [
      templateBoundComponents(template, staticUsage, hasStaticDescriptions(root)),
      "",
    ],
    leaf: boundLeaf("BoundBooleanField", describedLeafKinds("plain")),
    variantLeaf: templateVariantLeaf(template),
  };
};

export const emitTemplateForm = (
  template: Template,
  options: EmitFormOptions,
): string =>
  emitForm(
    templateBackend(
      template,
      options.visual ?? DEFAULT_VISUAL,
      scaffoldOf(options),
    ),
    options,
  );
