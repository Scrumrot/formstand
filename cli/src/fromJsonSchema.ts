import { NESTING_LIMIT_TODO } from "./depth";
import { DEFAULT_MAX_DEPTH } from "./fromZod";
import {
  type FieldSpec,
  type NamedField,
  type UnionVariant,
  labelFromName,
} from "./ir";

// JSON Schema frontend: the third door into the IR, beside the zod runtime
// walk and the TS checker walk. The input is a parsed JSON document — either
// a bare JSON Schema (the document IS the schema) or an OpenAPI 3.x document
// (schemas live under #/components/schemas and one is selected by name or
// pointer). Like type mode, the input carries no runtime validator, so the
// caller pairs the IR with emitZodSchema to generate one.
//
// Dialect stance: 2020-12 keywords (the dialect OpenAPI 3.1 adopted), with
// two pragmatic accommodations honored wherever they appear because they are
// unambiguous: OpenAPI 3.0's `nullable: true`, and draft-07's `definitions`
// as a $ref target. Draft-07's tuple spelling (`items` as an ARRAY) is the
// one place the dialects genuinely collide, so it degrades to a TODO naming
// the fix rather than being guessed at.

export type FromJsonSchemaResult = Readonly<{
  ir: FieldSpec;
  // The naming base for the generated schema/component: the selected
  // component's name, else the schema's `title`, else the caller's
  // filename-derived fallback.
  schemaName: string;
}>;

export type FromJsonSchemaOptions = Readonly<{
  // The --schema flag: a bare name (looked up under #/components/schemas,
  // #/$defs, then #/definitions) or a full "#/..." JSON pointer (which can
  // reach an operation's request-body schema). Required when an OpenAPI
  // document declares more than one component schema.
  select?: string | undefined;
  maxDepth?: number | undefined;
  // The input path as the user typed it — error messages echo it verbatim.
  source: string;
  // Naming base when neither a component name nor a `title` exists
  // (derived from the input filename by the caller).
  fallbackName: string;
}>;

type Flags = Readonly<{ optional: boolean; nullable: boolean }>;

const NO_FLAGS: Flags = { optional: false, nullable: false };

type JsonRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fallback = (flags: Flags, todo: string): FieldSpec => ({
  kind: "string",
  ...flags,
  todo,
});

// RFC 6901: "/" and "~" in a property name are escaped as ~1 and ~0; ~1
// must be unescaped first or "~01" would round-trip wrong.
const unescapePointerSegment = (segment: string): string =>
  segment.replace(/~1/g, "/").replace(/~0/g, "~");

// Resolve a "#/a/b" pointer against the document root. Returns undefined for
// a dangling pointer — the two callers disagree on how loud that is (a
// user-typed --schema throws; a $ref inside the document degrades to a TODO).
const resolvePointer = (root: unknown, pointer: string): unknown => {
  if (pointer === "#") return root;
  if (!pointer.startsWith("#/")) return undefined;
  return pointer
    .slice(2)
    .split("/")
    .map(unescapePointerSegment)
    .reduce<unknown>(
      (node, segment) =>
        isRecord(node)
          ? node[segment]
          : Array.isArray(node)
            ? node[Number(segment)]
            : undefined,
      root,
    );
};

// The walk context: the document root ($ref targets resolve against it) and
// the ref-cycle guard. JSON has no object cycles, but $ref chains can loop
// (a schema referencing itself is the JSON Schema recursion idiom), so the
// seen-set tracks resolved NODES by identity — the same degrade-to-TODO
// treatment fromZod gives its getter idiom.
type Context = Readonly<{
  root: unknown;
  seen: ReadonlySet<unknown>;
}>;

const stringArray = (value: unknown): readonly string[] | null =>
  Array.isArray(value) &&
  value.every((entry): entry is string => typeof entry === "string")
    ? value
    : null;

// `type` may be a string or an array of strings (2020-12). An array carrying
// "null" is the 3.1 spelling of nullable; exactly one non-null entry remains
// walkable, anything else has no single control to bind.
const typeOf = (
  schema: JsonRecord,
): Readonly<{ type: string | undefined; nullable: boolean }> | null => {
  const raw = schema["type"];
  if (raw === undefined) return { type: undefined, nullable: false };
  if (typeof raw === "string") return { type: raw, nullable: false };
  const entries = stringArray(raw);
  if (entries === null) return null;
  const rest = entries.filter((entry) => entry !== "null");
  const sole = rest[0];
  if (rest.length > 1) return null;
  return { type: sole, nullable: rest.length < entries.length };
};

// A JSON-primitive `default` seeds initialValues exactly like a captured zod
// .default() — and JSON literals are deterministic by construction, so the
// double-read guard fromZod needs has nothing to guard against here. A
// non-primitive default (object/array/null) has no safe source literal:
// droppedDefault marks it so the CLI mirrors the degradation on stderr.
const defaultProps = (
  schema: JsonRecord,
): Readonly<{ defaultValue?: unknown; droppedDefault?: true }> => {
  if (!("default" in schema)) return {};
  const value = schema["default"];
  return typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
    ? { defaultValue: value }
    : { droppedDefault: true };
};

const descriptionProps = (
  schema: JsonRecord,
): Readonly<{ description?: string }> => {
  const value = schema["description"];
  return typeof value === "string" && value.trim() !== ""
    ? { description: value }
    : {};
};

// `enum` of strings → the IR enum; `const` is a single-option enum, the same
// reading fromZod/fromType give a lone string literal.
const enumSpec = (schema: JsonRecord, flags: Flags): FieldSpec | null => {
  const constValue = schema["const"];
  if (constValue !== undefined) {
    return typeof constValue === "string"
      ? { kind: "enum", options: [constValue], ...flags }
      : fallback(flags, "non-string const; defaulted to string");
  }
  const raw = schema["enum"];
  if (raw === undefined) return null;
  const options = stringArray(raw);
  return options !== null
    ? { kind: "enum", options, ...flags }
    : fallback(flags, "non-string enum; defaulted to string");
};

// Each branch resolved one $ref level (discriminated-union branches are
// almost always written as refs into components/schemas), NOT walked — the
// caller decides what the branch set means before spending depth on it.
const resolvedBranches = (
  branches: readonly unknown[],
  ctx: Context,
): readonly unknown[] =>
  branches.map((branch) => {
    if (!isRecord(branch)) return branch;
    const ref = branch["$ref"];
    return typeof ref === "string"
      ? (resolvePointer(ctx.root, ref) ?? branch)
      : branch;
  });

// oneOf/anyOf where every branch is a string const → an enum (the JSON
// Schema idiom for enums-with-descriptions).
const enumFromBranches = (
  branches: readonly unknown[],
): readonly string[] | null => {
  const consts = branches.map((branch) =>
    isRecord(branch) && typeof branch["const"] === "string"
      ? branch["const"]
      : null,
  );
  return consts.every((value): value is string => value !== null)
    ? consts
    : null;
};

// OpenAPI's discriminator: oneOf object branches, each carrying the
// discriminant property as a string const, become the IR union — the same
// shape z.discriminatedUnion walks to. Anything short of that returns null
// and the caller degrades loudly.
const unionFromBranches = (
  schema: JsonRecord,
  branches: readonly unknown[],
  flags: Flags,
  ctx: Context,
  depth: number,
): FieldSpec | null => {
  const discriminator = schema["discriminator"];
  if (!isRecord(discriminator)) return null;
  const propertyName = discriminator["propertyName"];
  if (typeof propertyName !== "string") return null;
  const variants = branches.map((branch): UnionVariant | null => {
    if (!isRecord(branch)) return null;
    const properties = branch["properties"];
    if (!isRecord(properties)) return null;
    const tagSchema = properties[propertyName];
    const tag =
      isRecord(tagSchema) && typeof tagSchema["const"] === "string"
        ? tagSchema["const"]
        : null;
    if (tag === null) return null;
    const required = stringArray(branch["required"]) ?? [];
    // The discriminant binds as a plain (common) field; the branch's OTHER
    // properties are the variant fields useVariantField reaches.
    const fields = Object.entries(properties)
      .filter(([name]) => name !== propertyName)
      .map(([name, sub]) => namedField(name, sub, required, ctx, depth));
    return { tag, label: labelFromName(tag), fields };
  });
  return variants.every((variant): variant is UnionVariant => variant !== null)
    ? { kind: "union", discriminant: propertyName, variants, ...flags }
    : null;
};

// A property's label: its `title` when the author wrote one (JSON Schema
// titles ARE display labels), else the name-derived label the other
// frontends produce.
const namedField = (
  name: string,
  sub: unknown,
  required: readonly string[],
  ctx: Context,
  depth: number,
): NamedField => {
  const spec = walk(sub, NO_FLAGS, ctx, depth - 1);
  const title = isRecord(sub) ? sub["title"] : undefined;
  return {
    name,
    label:
      typeof title === "string" && title.trim() !== ""
        ? title
        : labelFromName(name),
    // JSON Schema properties are optional unless `required` lists them —
    // the opposite default from zod/TS, resolved here so the IR reads the
    // same either way.
    spec: { ...spec, optional: spec.optional || !required.includes(name) },
  };
};

const objectSpec = (
  schema: JsonRecord,
  flags: Flags,
  ctx: Context,
  depth: number,
): FieldSpec => {
  const properties = schema["properties"];
  if (!isRecord(properties)) {
    // additionalProperties/patternProperties describe open key sets — a
    // record, not a fixed field list; there is nothing to bind controls to.
    return fallback(
      flags,
      "object without fixed properties (record-like); defaulted to string",
    );
  }
  const required = stringArray(schema["required"]) ?? [];
  return {
    kind: "object",
    fields: Object.entries(properties).map(([name, sub]) =>
      namedField(name, sub, required, ctx, depth),
    ),
    ...flags,
  };
};

// allOf merging: every branch (after one $ref resolution) must be an object
// schema; their properties merge (later branches win a name collision, the
// composition-order rule) and their required lists union. Deeper allOf
// algebra (branch-level constraints on the same property) is out of scope —
// the merged properties walk as written.
const mergedAllOf = (
  branches: readonly unknown[],
  ctx: Context,
): JsonRecord | null => {
  const objects = resolvedBranches(branches, ctx).map((branch) =>
    isRecord(branch) && isRecord(branch["properties"]) ? branch : null,
  );
  if (!objects.every((branch): branch is JsonRecord => branch !== null)) {
    return null;
  }
  return {
    type: "object",
    properties: Object.fromEntries(
      objects.flatMap((branch) =>
        Object.entries(branch["properties"] as JsonRecord),
      ),
    ),
    required: objects.flatMap((branch) => stringArray(branch["required"]) ?? []),
  };
};

const arraySpec = (
  schema: JsonRecord,
  flags: Flags,
  ctx: Context,
  depth: number,
): FieldSpec => {
  const prefixItems = schema["prefixItems"];
  const items = schema["items"];
  // 2020-12 tuples: prefixItems holds the fixed positions; a sibling `items`
  // schema is the variadic rest, which isn't a fixed shape — keep the head
  // and flag the dropped rest, mirroring the zod walk's tuple rest rule.
  if (Array.isArray(prefixItems)) {
    const elements = prefixItems.map((element) =>
      walk(element, NO_FLAGS, ctx, depth - 1),
    );
    const restTodo =
      items !== undefined && items !== false
        ? { todo: "tuple rest element is not generated; bind it by hand" }
        : {};
    return { kind: "tuple", elements, ...flags, ...restTodo };
  }
  // Draft-07 spelled tuples as `items: [...]` — the one spot the dialects
  // collide, so name the fix instead of guessing.
  if (Array.isArray(items)) {
    return fallback(
      flags,
      "draft-07 tuple (`items` as an array); spell it as 2020-12 `prefixItems`",
    );
  }
  if (items === undefined) {
    return fallback(flags, "array without `items`; defaulted to string");
  }
  return {
    kind: "array",
    item: walk(items, NO_FLAGS, ctx, depth - 1),
    ...flags,
  };
};

// Description capture mirrors fromZod's outermost-wins rule: a $ref site's
// own description overrides the target's (2020-12 allows keywords beside
// $ref, and the site is the outermost wrapper here).
const walk = (
  schema: unknown,
  flags: Flags,
  ctx: Context,
  depth: number,
): FieldSpec => {
  // Bare `true`/`false` are legal schemas ("anything"/"nothing") — neither
  // names a control.
  if (!isRecord(schema)) {
    return fallback(flags, "schema is not an object; defaulted to string");
  }
  if (ctx.seen.has(schema)) {
    return fallback(flags, "recursive schema; defaulted to string");
  }
  if (depth <= 0) {
    return fallback(flags, NESTING_LIMIT_TODO);
  }
  const nextCtx: Context = { ...ctx, seen: new Set([...ctx.seen, schema]) };
  const spec = walkNode(schema, flags, nextCtx, depth);
  return { ...spec, ...descriptionProps(schema), ...defaultProps(schema) };
};

const walkNode = (
  schema: JsonRecord,
  flags: Flags,
  ctx: Context,
  depth: number,
): FieldSpec => {
  const ref = schema["$ref"];
  if (typeof ref === "string") {
    if (!ref.startsWith("#")) {
      return fallback(
        flags,
        `external $ref "${ref}" is not resolved; defaulted to string`,
      );
    }
    const target = resolvePointer(ctx.root, ref);
    if (target === undefined) {
      return fallback(
        flags,
        `$ref "${ref}" does not resolve; defaulted to string`,
      );
    }
    return walk(target, flags, ctx, depth);
  }
  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) {
    const merged = mergedAllOf(allOf, ctx);
    return merged !== null
      ? walkNode(merged, flags, ctx, depth)
      : fallback(
          flags,
          "allOf with non-object branches is not supported; defaulted to string",
        );
  }
  const branches = schema["oneOf"] ?? schema["anyOf"];
  if (Array.isArray(branches)) {
    const resolved = resolvedBranches(branches, ctx);
    // oneOf [X, {type: "null"}] is 3.1's other nullable spelling.
    const nonNull = resolved.filter(
      (branch) => !(isRecord(branch) && branch["type"] === "null"),
    );
    if (nonNull.length === 1 && nonNull.length < resolved.length) {
      return walk(
        nonNull[0],
        { ...flags, nullable: true },
        ctx,
        depth,
      );
    }
    const options = enumFromBranches(resolved);
    if (options !== null) return { kind: "enum", options, ...flags };
    const union = unionFromBranches(schema, resolved, flags, ctx, depth);
    if (union !== null) return union;
    return fallback(
      flags,
      "oneOf/anyOf without a discriminator or string consts is not supported; defaulted to string",
    );
  }
  const typed = typeOf(schema);
  if (typed === null) {
    return fallback(
      flags,
      "multi-type `type` array has no single control; defaulted to string",
    );
  }
  // Two nullable dialects meet here: the 3.1 type-array spelling (typed)
  // and 3.0's `nullable: true` keyword — both mark the same IR flag.
  const withNull: Flags = {
    ...flags,
    nullable: flags.nullable || typed.nullable || schema["nullable"] === true,
  };
  const constOrEnum = enumSpec(schema, withNull);
  if (constOrEnum !== null) return constOrEnum;
  switch (typed.type) {
    case "string": {
      const format = schema["format"];
      // date/date-time carry calendar semantics a date control serves better
      // than free text; every other format (email, uri, uuid, ...) stays a
      // string — its constraint belongs to validation, not the control.
      return format === "date" || format === "date-time"
        ? { kind: "date", ...withNull }
        : { kind: "string", ...withNull };
    }
    case "number":
    case "integer":
      return { kind: "number", ...withNull };
    case "boolean":
      return { kind: "boolean", ...withNull };
    case "object":
      return objectSpec(schema, withNull, ctx, depth);
    case "array":
      return arraySpec(schema, withNull, ctx, depth);
    case "null":
      return fallback(
        withNull,
        "type is only null; defaulted to string",
      );
    case undefined:
      // No type keyword at all: an object shape can still be inferred from
      // `properties` (a very common OpenAPI omission); anything else is too
      // ambiguous to guess.
      return isRecord(schema["properties"])
        ? objectSpec(schema, withNull, ctx, depth)
        : fallback(
            withNull,
            "schema without a `type` or `properties`; defaulted to string",
          );
    default:
      return fallback(
        withNull,
        `unsupported type "${typed.type}"; defaulted to string`,
      );
  }
};

// Where a bare --schema NAME is looked up, in precedence order: the OpenAPI
// component store first, then the two JSON Schema definition stores.
const NAME_STORES: readonly (readonly string[])[] = [
  ["components", "schemas"],
  ["$defs"],
  ["definitions"],
];

const storeAt = (root: unknown, segments: readonly string[]): JsonRecord | null => {
  const node = segments.reduce<unknown>(
    (acc, segment) => (isRecord(acc) ? acc[segment] : undefined),
    root,
  );
  return isRecord(node) ? node : null;
};

const selectSchema = (
  root: unknown,
  select: string | undefined,
  source: string,
): Readonly<{ schema: unknown; name: string | undefined }> => {
  if (select !== undefined) {
    if (select.startsWith("#")) {
      const target = resolvePointer(root, select);
      if (target === undefined) {
        throw new Error(`--schema pointer "${select}" does not resolve in ${source}`);
      }
      // A pointer's last segment names the schema when it reads as a name
      // ("#/components/schemas/Profile" → "Profile"); an index or operation
      // path falls back to the title/filename chain.
      const last = unescapePointerSegment(select.split("/").at(-1) ?? "");
      return {
        schema: target,
        name: /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(last) ? last : undefined,
      };
    }
    const store = NAME_STORES.map((segments) => storeAt(root, segments)).find(
      (candidate) => candidate !== null && candidate[select] !== undefined,
    );
    if (store === null || store === undefined) {
      const available = NAME_STORES.flatMap((segments) => {
        const candidate = storeAt(root, segments);
        return candidate === null ? [] : Object.keys(candidate);
      }).join(", ");
      throw new Error(
        `no schema named "${select}" in ${source} (available: ${available.length === 0 ? "none" : available})`,
      );
    }
    return { schema: store[select], name: select };
  }
  const openapi = isRecord(root) ? root["openapi"] : undefined;
  if (typeof openapi === "string") {
    // An OpenAPI document is not itself a schema — one must be selected.
    const store = storeAt(root, ["components", "schemas"]);
    const names = store === null ? [] : Object.keys(store);
    const sole = names[0];
    if (store !== null && names.length === 1 && sole !== undefined) {
      return { schema: store[sole], name: sole };
    }
    if (names.length === 0) {
      throw new Error(
        `no component schemas found in ${source} (#/components/schemas is empty); point --schema at one with a "#/..." pointer`,
      );
    }
    throw new Error(
      `multiple component schemas in ${source} (${names.join(", ")}); pick one with --schema`,
    );
  }
  return { schema: root, name: undefined };
};

export const fromJsonSchema = (
  document: unknown,
  options: FromJsonSchemaOptions,
): FromJsonSchemaResult => {
  if (isRecord(document) && typeof document["swagger"] === "string") {
    throw new Error(
      `${options.source} is a Swagger 2.0 document; convert it to OpenAPI 3 first (2.0 predates the JSON Schema alignment)`,
    );
  }
  const { schema, name } = selectSchema(document, options.select, options.source);
  const ir = walk(
    schema,
    NO_FLAGS,
    { root: document, seen: new Set() },
    options.maxDepth ?? DEFAULT_MAX_DEPTH,
  );
  const title = isRecord(schema) ? schema["title"] : undefined;
  return {
    ir,
    schemaName:
      name ??
      (typeof title === "string" && title.trim() !== ""
        ? title
        : options.fallbackName),
  };
};
