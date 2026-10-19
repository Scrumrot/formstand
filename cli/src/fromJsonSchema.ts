import { NESTING_LIMIT_TODO } from "./depth";
import { DEFAULT_MAX_DEPTH } from "./fromZod";
import {
  type FieldSpec,
  type NamedField,
  type NumberChecks,
  type StringChecks,
  type UnionVariant,
  labelFromName,
} from "./ir";

// JSON Schema frontend: the third door into the IR, beside the zod runtime
// walk and the TS checker walk. The input is a parsed JSON document, either
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
  // The input path as the user typed it, error messages echo it verbatim.
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

// Bound keywords ride into the IR only when they are finite numbers: a
// string-typed "minimum" (seen in hand-written schemas) or Infinity would
// emit a validator zod rejects at load time. A NaN/absent keyword is simply
// "unconstrained".
const finiteKeyword = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

// The cast is the computed-key idiom: TS types `{ [key]: value }` as
// `{ [x: string]: number }` and cannot relate `{}` to a generic Partial.
const boundProps = <K extends string>(
  key: K,
  value: number | undefined,
): Readonly<Partial<Record<K, number>>> =>
  (value === undefined ? {} : { [key]: value }) as Readonly<
    Partial<Record<K, number>>
  >;

// minLength/maxLength (strings) and minItems/maxItems (arrays) share one
// shape, so one reader serves both; the caller names the keyword pair.
const lengthChecksOf = (
  schema: JsonRecord,
  minKey: string,
  maxKey: string,
): StringChecks | undefined => {
  const checks: StringChecks = {
    ...boundProps("minLength", finiteKeyword(schema[minKey])),
    ...boundProps("maxLength", finiteKeyword(schema[maxKey])),
  };
  return Object.keys(checks).length === 0 ? undefined : checks;
};

// Draft 2020-12 exclusiveMinimum/exclusiveMaximum are numbers; draft-04
// spelled them as a boolean flag beside minimum/maximum (`minimum: 5,
// exclusiveMinimum: true`), still common in hand-written and older
// generated documents, and ignoring the flag silently loosened the bound to
// inclusive. The flag reads as the bound itself in exclusive form. When
// both an inclusive and an exclusive bound exist, the tighter one wins;
// ties go exclusive since it is the stricter of the two.
const exclusiveBound = (
  flagOrValue: unknown,
  inclusive: number | undefined,
): number | undefined =>
  flagOrValue === true ? inclusive : finiteKeyword(flagOrValue);

// multipleOf rides into the validator only when it is a positive finite
// number (zod's .multipleOf() rejects 0 and negatives at parse time).
const multipleOfKeyword = (value: unknown): number | undefined => {
  const n = finiteKeyword(value);
  return n !== undefined && n > 0 ? n : undefined;
};

const numberChecksOf = (
  schema: JsonRecord,
  int: boolean,
): NumberChecks | undefined => {
  const min = finiteKeyword(schema["minimum"]);
  const xmin = exclusiveBound(schema["exclusiveMinimum"], min);
  const max = finiteKeyword(schema["maximum"]);
  const xmax = exclusiveBound(schema["exclusiveMaximum"], max);
  const lower: Pick<NumberChecks, "min" | "minExclusive"> =
    xmin !== undefined && (min === undefined || xmin >= min)
      ? { min: xmin, minExclusive: true }
      : boundProps("min", min);
  const upper: Pick<NumberChecks, "max" | "maxExclusive"> =
    xmax !== undefined && (max === undefined || xmax <= max)
      ? { max: xmax, maxExclusive: true }
      : boundProps("max", max);
  const checks: NumberChecks = {
    ...(int ? { int: true } : {}),
    ...lower,
    ...upper,
    ...boundProps("multipleOf", multipleOfKeyword(schema["multipleOf"])),
  };
  return Object.keys(checks).length === 0 ? undefined : checks;
};

const checksProps = <T>(checks: T | undefined): Readonly<{ checks?: T }> =>
  checks === undefined ? {} : { checks };

const unmodeledProps = (
  names: readonly string[],
): Readonly<{ unmodeledChecks?: readonly string[] }> =>
  names.length === 0 ? {} : { unmodeledChecks: names };

// Whether a `pattern` compiles under JavaScript's RegExp. JSON Schema
// patterns are ECMA-262 dialect by specification, but documents carry
// PCRE-isms (possessive quantifiers, inline flags) that RegExp refuses, and
// `.regex(new RegExp(...))` with one of those would throw when the generated
// module LOADS, in every consumer. The try/catch is the operator-input
// boundary: the outcome is a value the walker switches on.
type PatternOutcome =
  | Readonly<{ kind: "compiles" }>
  | Readonly<{ kind: "invalid"; reason: string }>;

const compilePattern = (pattern: string): PatternOutcome => {
  try {
    // RegExp is callable without `new`; only the throw matters here.
    RegExp(pattern);
    return { kind: "compiles" };
  } catch (e) {
    return {
      kind: "invalid",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
};

// RFC 6901 in a URI fragment: percent-decoding comes first (a "#/$defs/
// My%20Type" pointer names the "My Type" key), THEN "~1" and "~0" unescape
// to "/" and "~", ~1 before ~0 or "~01" would round-trip wrong. A malformed
// percent sequence is operator input, not a crash: the segment is kept as
// typed and the lookup simply misses.
const percentDecode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const unescapePointerSegment = (segment: string): string =>
  percentDecode(segment).replace(/~1/g, "/").replace(/~0/g, "~");

// Resolve a "#/a/b" pointer against the document root. Returns undefined for
// a dangling pointer, the two callers disagree on how loud that is (a
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
          ? // Own keys only: "#/components/constructor" must miss, not
            // land on Object.prototype.constructor.
            Object.hasOwn(node, segment)
            ? node[segment]
            : undefined
          : Array.isArray(node)
            ? node[Number(segment)]
            : undefined,
      root,
    );
};

// The walk context: the document root ($ref targets resolve against it) and
// the ref-cycle guard. JSON has no object cycles, but $ref chains can loop
// (a schema referencing itself is the JSON Schema recursion idiom), so the
// seen-set tracks resolved NODES by identity, the same degrade-to-TODO
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
// .default(), and JSON literals are deterministic by construction, so the
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
// reading fromZod/fromType give a lone string literal. A `null` entry in
// the list is how OpenAPI 3.0 (`nullable: true`) and 3.1 (`type:
// ["string", "null"]`) both spell a nullable enum, the list must repeat
// the null for the value to validate, so it is the nullable flag, not an
// option: stripped and marked. An empty list (or one that was only null)
// has no option to pick and no value a submit could carry, so it is named
// rather than emitted as `z.enum([])`.
const enumSpec = (schema: JsonRecord, flags: Flags): FieldSpec | null => {
  const constValue = schema["const"];
  if (constValue !== undefined) {
    return typeof constValue === "string"
      ? { kind: "enum", options: [constValue], ...flags }
      : fallback(flags, "non-string const; defaulted to string");
  }
  const raw = schema["enum"];
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) {
    return fallback(flags, "non-string enum; defaulted to string");
  }
  const nonNull = raw.filter((entry) => entry !== null);
  const withNull: Flags = {
    ...flags,
    nullable: flags.nullable || nonNull.length < raw.length,
  };
  if (nonNull.length === 0) {
    return fallback(
      withNull,
      "empty enum has no option to choose from; defaulted to string",
    );
  }
  const options = stringArray(nonNull);
  return options !== null
    ? { kind: "enum", options, ...withNull }
    : fallback(withNull, "non-string enum; defaulted to string");
};

const withoutKeys = (
  record: JsonRecord,
  keys: readonly string[],
): JsonRecord =>
  Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key)),
  );

// One composition branch, resolved but NOT walked (the caller decides what
// the branch set means before spending depth on it): $ref chains are
// followed to their end (`Alias2 -> Alias -> Base`), and a branch that is
// itself an allOf is flattened to one object schema, so `Leaf: allOf
// [Mid, ...]` over `Mid: allOf [Base, ...]` merges all the way down. The
// seen-set is the cycle guard for refs that loop (`A: allOf [{$ref A}]`):
// a repeat resolves to undefined, which no merge accepts, so the caller
// degrades with a TODO instead of recursing forever. A dangling $ref stays
// as written so the walk can name it. An allOf that will not merge stays
// as written too; walking it one level down reports why.
const resolveBranch = (
  branch: unknown,
  ctx: Context,
  seen: ReadonlySet<unknown>,
): unknown => {
  if (!isRecord(branch)) return branch;
  if (seen.has(branch)) return undefined;
  const nextSeen: ReadonlySet<unknown> = new Set([...seen, branch]);
  const ref = branch["$ref"];
  if (typeof ref === "string") {
    const target = resolvePointer(ctx.root, ref);
    return target === undefined ? branch : resolveBranch(target, ctx, nextSeen);
  }
  const allOf = branch["allOf"];
  if (Array.isArray(allOf)) {
    const merged = mergedAllOf(
      allOf.map((inner) => resolveBranch(inner, ctx, nextSeen)),
      withoutKeys(branch, ["allOf"]),
    );
    return merged ?? branch;
  }
  return branch;
};

// Discriminated-union branches are almost always written as refs into
// components/schemas; each is resolved (chains and nested allOf included).
const resolvedBranches = (
  branches: readonly unknown[],
  ctx: Context,
): readonly unknown[] =>
  branches.map((branch) => resolveBranch(branch, ctx, new Set()) ?? branch);

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

// The discriminant tag of one oneOf branch, in the three spellings OpenAPI
// documents actually use. 3.1 (and hand-written 2020-12) write
// `{ const: "card" }`; 3.0 has no `const`, so the same tag is spelled
// `{ enum: ["card"] }`, a single-value enum; and a document may name the
// tags only in `discriminator.mapping` ({ card: "#/components/schemas/
// CardPayment" }), leaving the branch's own property untyped. The mapping
// is consulted by the branch's $ref BEFORE resolution, which is why the raw
// branch travels alongside the resolved one.
const branchTag = (
  resolved: JsonRecord,
  raw: unknown,
  propertyName: string,
  mapping: JsonRecord | undefined,
): string | null => {
  const properties = resolved["properties"];
  const tagSchema = isRecord(properties) ? properties[propertyName] : undefined;
  const constTag =
    isRecord(tagSchema) && typeof tagSchema["const"] === "string"
      ? tagSchema["const"]
      : null;
  if (constTag !== null) return constTag;
  const enumValues = isRecord(tagSchema) ? stringArray(tagSchema["enum"]) : null;
  const soleEnum = enumValues !== null && enumValues.length === 1 ? enumValues[0] : undefined;
  if (soleEnum !== undefined) return soleEnum;
  const ref = isRecord(raw) ? raw["$ref"] : undefined;
  const mapped =
    mapping !== undefined && typeof ref === "string"
      ? Object.entries(mapping).find(([, target]) => target === ref)?.[0]
      : undefined;
  return mapped ?? null;
};

// How a oneOf failed to be a union, for the caller's TODO text: no usable
// discriminator at all, or one branch without a tag (named so the fix is
// obvious from the comment alone).
type UnionOutcome =
  | Readonly<{ kind: "union"; spec: FieldSpec }>
  | Readonly<{ kind: "no-discriminator" }>
  | Readonly<{ kind: "untagged-branch"; branch: string; propertyName: string }>;

// The branch's name for a TODO: its $ref target when it has one, else its
// title, else its position.
const branchName = (raw: unknown, resolved: unknown, index: number): string => {
  const ref = isRecord(raw) ? raw["$ref"] : undefined;
  if (typeof ref === "string") return ref;
  const title = isRecord(resolved) ? resolved["title"] : undefined;
  return typeof title === "string" ? `"${title}"` : `#${index}`;
};

// OpenAPI's discriminator: oneOf object branches, each carrying the
// discriminant property as a string tag (see branchTag for the accepted
// spellings), become the IR union, the same shape z.discriminatedUnion
// walks to. Anything short of that reports why, and the caller degrades
// loudly with that reason.
const unionFromBranches = (
  schema: JsonRecord,
  rawBranches: readonly unknown[],
  branches: readonly unknown[],
  flags: Flags,
  ctx: Context,
  depth: number,
): UnionOutcome => {
  const discriminator = schema["discriminator"];
  if (!isRecord(discriminator)) return { kind: "no-discriminator" };
  const propertyName = discriminator["propertyName"];
  if (typeof propertyName !== "string") return { kind: "no-discriminator" };
  const mapping = isRecord(discriminator["mapping"])
    ? discriminator["mapping"]
    : undefined;
  const variants = branches.map((branch, i): UnionVariant | string => {
    const raw = rawBranches[i];
    if (!isRecord(branch)) return branchName(raw, branch, i);
    const properties = branch["properties"];
    if (!isRecord(properties)) return branchName(raw, branch, i);
    const tag = branchTag(branch, raw, propertyName, mapping);
    if (tag === null) return branchName(raw, branch, i);
    const required = stringArray(branch["required"]) ?? [];
    // The discriminant binds as a plain (common) field; the branch's OTHER
    // properties are the variant fields useVariantField reaches.
    const fields = Object.entries(properties)
      .filter(([name]) => name !== propertyName)
      .map(([name, sub]) => namedField(name, sub, required, ctx, depth));
    return { tag, label: labelFromName(tag), fields };
  });
  const untagged = variants.find(
    (variant): variant is string => typeof variant === "string",
  );
  return untagged !== undefined
    ? { kind: "untagged-branch", branch: untagged, propertyName }
    : {
        kind: "union",
        spec: {
          kind: "union",
          discriminant: propertyName,
          variants: variants.filter(
            (variant): variant is UnionVariant => typeof variant !== "string",
          ),
          ...flags,
        },
      };
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
    // JSON Schema properties are optional unless `required` lists them,
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
    // additionalProperties/patternProperties describe open key sets, a
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

// An allOf branch that can take part in an object merge: an object schema
// (typed so, or untyped with `properties`), or a constraint-only branch
// (`{ required: [...] }`, `{ description }`) that adds no member. Anything
// typed as something else (a string enum, say) cannot merge into members.
const mergeableObject = (branch: unknown): JsonRecord | null =>
  isRecord(branch) &&
  (branch["type"] === undefined || branch["type"] === "object") &&
  (branch["properties"] === undefined || isRecord(branch["properties"]))
    ? branch
    : null;

// allOf merging: every resolved branch must be mergeable (see above); their
// properties merge (later branches win a name collision, the
// composition-order rule) and their required lists union. The OUTER
// schema's own keywords survive the merge: 3.0 documents hang `nullable`,
// `description`, and `default` on the allOf site, and dropping them made
// `{ allOf: [{$ref}], nullable: true }` a required object. The outer's own
// `properties`/`required` (2020-12 allows them beside allOf) join as the
// last branch. Deeper allOf algebra (branch-level constraints on the same
// property) is out of scope, the merged properties walk as written.
const mergedAllOf = (
  branches: readonly unknown[],
  outer: JsonRecord,
): JsonRecord | null => {
  const objects = [...branches, outer].map(mergeableObject);
  if (!objects.every((branch): branch is JsonRecord => branch !== null)) {
    return null;
  }
  return {
    ...withoutKeys(outer, ["properties", "required"]),
    type: "object",
    properties: Object.fromEntries(
      objects.flatMap((branch) =>
        isRecord(branch["properties"])
          ? Object.entries(branch["properties"])
          : [],
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
  // schema is the variadic rest, which isn't a fixed shape, keep the head
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
  // Draft-07 spelled tuples as `items: [...]`, the one spot the dialects
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
    ...checksProps(lengthChecksOf(schema, "minItems", "maxItems")),
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
  // Bare `true`/`false` are legal schemas ("anything"/"nothing"), neither
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
    // 3.0's `{ $ref, nullable: true }`: the flag sits at the SITE, and the
    // walk of the target returned before the type switch's nullable merge
    // could see it. (The site's description and default are applied by the
    // enclosing walk(), outermost wins.)
    return walk(
      target,
      { ...flags, nullable: flags.nullable || schema["nullable"] === true },
      ctx,
      depth,
    );
  }
  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) {
    const outer = withoutKeys(schema, ["allOf"]);
    const resolved = allOf.map((branch) =>
      resolveBranch(branch, ctx, new Set([schema])),
    );
    const sole = resolved[0];
    // A single-branch allOf is 3.0's way to attach description/nullable to
    // a $ref (keywords beside $ref were ignored before 2020-12): whatever
    // the branch is, the result is that branch with the site's keywords
    // layered on top. Walked (not walkNode) so the branch's own description
    // applies when the site has none, as a plain $ref site would.
    if (
      resolved.length === 1 &&
      isRecord(sole) &&
      mergeableObject(sole) === null
    ) {
      return walk({ ...sole, ...outer }, flags, ctx, depth);
    }
    const merged = mergedAllOf(resolved, outer);
    if (merged !== null) return walkNode(merged, flags, ctx, depth);
    return fallback(
      flags,
      resolved.some((branch) => branch === undefined)
        ? "allOf branch refers back to itself; defaulted to string"
        : "allOf with non-object branches is not supported; defaulted to string",
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
    const union = unionFromBranches(
      schema,
      branches,
      resolved,
      flags,
      ctx,
      depth,
    );
    switch (union.kind) {
      case "union":
        return union.spec;
      // The one TODO that names its branch: a discriminator exists, so the
      // author meant a union, and the fix is a tag on that branch (const, a
      // single-value enum, or a discriminator.mapping entry).
      case "untagged-branch":
        return fallback(
          flags,
          `oneOf branch ${union.branch} has no usable "${union.propertyName}" tag (expected a const, a single-value enum, or a discriminator.mapping entry); defaulted to string`,
        );
      case "no-discriminator":
        return fallback(
          flags,
          "oneOf/anyOf without a discriminator or string consts is not supported; defaulted to string",
        );
    }
  }
  const typed = typeOf(schema);
  if (typed === null) {
    return fallback(
      flags,
      "multi-type `type` array has no single control; defaulted to string",
    );
  }
  // Two nullable dialects meet here: the 3.1 type-array spelling (typed)
  // and 3.0's `nullable: true` keyword, both mark the same IR flag.
  const withNull: Flags = {
    ...flags,
    nullable: flags.nullable || typed.nullable || schema["nullable"] === true,
  };
  const constOrEnum = enumSpec(schema, withNull);
  if (constOrEnum !== null) return constOrEnum;
  switch (typed.type) {
    case "string": {
      const format = schema["format"];
      // date/date-time carry calendar semantics a date control serves
      // better than free text. email/uri/uuid stay TEXT CONTROLS but ride
      // into the generated validator (z.email()/z.url()/z.uuid()), the
      // constraint belongs to validation, and the emitted schema is the
      // runtime source of truth, so dropping it would silently weaken the
      // document's contract. Every other format stays a plain string.
      if (format === "date" || format === "date-time") {
        return { kind: "date", ...withNull };
      }
      const zodFormat =
        format === "email"
          ? ("email" as const)
          : format === "uri" || format === "url"
            ? ("url" as const)
            : format === "uuid"
              ? ("uuid" as const)
              : undefined;
      // A `pattern` rides into the validator as .regex() when RegExp accepts
      // it; one it refuses is a TODO (the field would otherwise ship with
      // the contract silently dropped, which is what this comment promised
      // not to do). Any other format (ipv4, hostname, binary, ...) keeps a
      // text control and an unconstrained string: zod has no spelling for
      // it here. Both the pattern and such a format are recorded as
      // unmodeled, the generated spec's sample is built blind to them.
      const pattern = schema["pattern"];
      const compiled =
        typeof pattern === "string" ? compilePattern(pattern) : undefined;
      if (compiled !== undefined && compiled.kind === "invalid") {
        return fallback(
          withNull,
          `pattern ${JSON.stringify(pattern)} is not a valid JavaScript regular expression (${compiled.reason}); defaulted to string`,
        );
      }
      const regex =
        compiled !== undefined && typeof pattern === "string"
          ? { regex: pattern }
          : {};
      const lengths = lengthChecksOf(schema, "minLength", "maxLength");
      const checks: StringChecks = { ...lengths, ...regex };
      const unmodeled = unmodeledProps([
        ...(compiled === undefined ? [] : ["pattern"]),
        ...(typeof format === "string" && zodFormat === undefined
          ? [format]
          : []),
      ]);
      return {
        kind: "string",
        ...(zodFormat === undefined ? {} : { format: zodFormat }),
        ...checksProps(Object.keys(checks).length === 0 ? undefined : checks),
        ...unmodeled,
        ...withNull,
      };
    }
    case "number":
    case "integer":
      return {
        kind: "number",
        ...checksProps(numberChecksOf(schema, typed.type === "integer")),
        // multipleOf reaches the validator (.multipleOf) but never the
        // sample, so the spec skips its round trip over it.
        ...unmodeledProps(
          multipleOfKeyword(schema["multipleOf"]) === undefined
            ? []
            : ["multipleOf"],
        ),
        ...withNull,
      };
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
    // Own keys only: `--schema constructor` (or toString, __proto__) used to
    // resolve a prototype member and generate a degraded form named after
    // it instead of reporting that no such schema exists.
    const store = NAME_STORES.map((segments) => storeAt(root, segments)).find(
      (candidate) => candidate !== null && Object.hasOwn(candidate, select),
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
    // An OpenAPI document is not itself a schema, one must be selected.
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
