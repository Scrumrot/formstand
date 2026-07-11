import {
  type FieldSpec,
  type NamedField,
  type UnionVariant,
  labelFromName,
} from "./ir";

// Walks a *runtime* zod v4 schema into the IR.
//
// Deliberately duck-typed: the schema the user hands us was built with *their*
// copy of zod, so `instanceof z.ZodString` against our copy is unreliable
// (the classic dual-package hazard). zod v4 exposes stable string
// discriminants on `schema.def.type` ("string", "object", "optional", ...)
// and plain-data payloads on `def` (shape / element / entries / innerType /
// options / values / in), so we read those instead.

type Flags = Readonly<{ optional: boolean; nullable: boolean }>;

type ZodDefLike = Readonly<{
  type?: unknown;
  innerType?: unknown;
  shape?: unknown;
  element?: unknown;
  entries?: unknown;
  options?: unknown;
  values?: unknown;
  in?: unknown;
  discriminator?: unknown;
  // z.tuple: the fixed positional element schemas, plus an optional variadic
  // rest schema (which we don't generate).
  items?: unknown;
  rest?: unknown;
}>;

const defOf = (schema: unknown): ZodDefLike | null => {
  if (typeof schema !== "object" && typeof schema !== "function") return null;
  if (schema === null) return null;
  const def = (schema as Readonly<{ def?: unknown }>).def;
  return typeof def === "object" && def !== null ? (def as ZodDefLike) : null;
};

// A value that walks and quacks like a zod schema: carries a `def` payload
// and a callable `safeParse`.
export const isZodSchema = (value: unknown): boolean =>
  defOf(value) !== null &&
  typeof (value as Readonly<{ safeParse?: unknown }>).safeParse === "function";

const stringValues = (values: unknown): readonly string[] | null => {
  if (!Array.isArray(values)) return null;
  return values.every((v): v is string => typeof v === "string")
    ? values
    : null;
};

// A union whose branches are all string literals reads as an enum.
const enumFromUnion = (options: unknown): readonly string[] | null => {
  if (!Array.isArray(options)) return null;
  const literals = options.map((option) => {
    const def = defOf(option);
    return def !== null && def.type === "literal"
      ? stringValues(def.values)
      : null;
  });
  return literals.every((values): values is readonly string[] => values !== null)
    ? literals.flat()
    : null;
};

// The single string value of a ZodLiteral, or null (non-literal, non-string,
// or a multi-value literal — none of which name a discriminant branch).
const literalTag = (schema: unknown): string | null => {
  const def = defOf(schema);
  if (def === null || def.type !== "literal") return null;
  const values = stringValues(def.values);
  if (values === null || values.length !== 1) return null;
  return values[0] ?? null;
};

// A z.discriminatedUnion at a FIELD position → the union spec. zod v4 tags
// the def as type "union" but also carries `discriminator` (the key string)
// and `options` (the object branches). Detection requires a string
// discriminant AND every branch to be an object whose discriminant key is a
// single-value string literal; anything else returns null so the caller
// falls through to the enum/string handling.
const discriminatedUnionFrom = (
  def: ZodDefLike,
  flags: Flags,
  depth: number,
  seen: ReadonlySet<unknown>,
): FieldSpec | null => {
  const discriminator = def.discriminator;
  if (typeof discriminator !== "string") return null;
  if (!Array.isArray(def.options)) return null;
  const variants = def.options.map((option): UnionVariant | null => {
    const optDef = defOf(option);
    if (optDef === null || optDef.type !== "object") return null;
    const shape = optDef.shape;
    if (typeof shape !== "object" || shape === null) return null;
    const record = shape as Readonly<Record<string, unknown>>;
    const tag = literalTag(record[discriminator]);
    if (tag === null) return null;
    // The discriminant binds as a plain (common) field; the branch's OTHER
    // keys are the variant-specific fields useVariantField reaches.
    const fields = Object.entries(record)
      .filter(([name]) => name !== discriminator)
      .map(
        ([name, sub]): NamedField => ({
          name,
          label: labelFromName(name),
          spec: walk(sub, { optional: false, nullable: false }, depth, seen),
        }),
      );
    return { tag, label: labelFromName(tag), fields };
  });
  return variants.every((v): v is UnionVariant => v !== null)
    ? { kind: "union", discriminant: discriminator, variants, ...flags }
    : null;
};

// The default nesting budget (fromType shares it). Also the backstop for
// recursion the seen-set misses (getters that build a fresh schema object on
// every access) — the walk always terminates even for a truly cyclic schema.
// Overridable via fromZod's maxDepth argument (the CLI's --max-depth).
export const DEFAULT_MAX_DEPTH = 10;

const fieldsFromShape = (
  shape: unknown,
  depth: number,
  seen: ReadonlySet<unknown>,
): readonly NamedField[] =>
  typeof shape === "object" && shape !== null
    ? Object.entries(shape as Readonly<Record<string, unknown>>).map(
        ([name, sub]): NamedField => ({
          name,
          label: labelFromName(name),
          spec: walk(sub, { optional: false, nullable: false }, depth, seen),
        }),
      )
    : [];

const fallback = (flags: Flags, todo: string): FieldSpec => ({
  kind: "string",
  ...flags,
  todo,
});

// zod v4's recursion idiom (`get children() { return z.array(Category); }`)
// makes the schema graph cyclic: track visited schema objects by identity so
// a cycle degrades to a todo string field instead of a stack overflow.
const walk = (
  schema: unknown,
  flags: Flags,
  depth: number,
  seen: ReadonlySet<unknown>,
): FieldSpec => {
  const def = defOf(schema);
  if (def === null) {
    return fallback(flags, "value is not a zod schema; defaulted to string");
  }
  if (seen.has(schema)) {
    return fallback(flags, "recursive schema; defaulted to string");
  }
  if (depth <= 0) {
    return fallback(flags, "nesting depth limit reached; defaulted to string");
  }
  const nextSeen: ReadonlySet<unknown> = new Set([...seen, schema]);
  const type = typeof def.type === "string" ? def.type : "<unknown>";
  switch (type) {
    case "string":
      return { kind: "string", ...flags };
    case "number":
    case "int":
      return { kind: "number", ...flags };
    case "boolean":
      return { kind: "boolean", ...flags };
    case "date":
      return { kind: "date", ...flags };
    case "enum": {
      const options = stringValues(
        typeof def.entries === "object" && def.entries !== null
          ? Object.values(def.entries)
          : null,
      );
      return options !== null
        ? { kind: "enum", options, ...flags }
        : fallback(flags, "non-string enum; defaulted to string");
    }
    case "literal": {
      const options = stringValues(def.values);
      return options !== null
        ? { kind: "enum", options, ...flags }
        : fallback(flags, "non-string literal; defaulted to string");
    }
    case "object":
      return {
        kind: "object",
        fields: fieldsFromShape(def.shape, depth - 1, nextSeen),
        ...flags,
      };
    case "array":
      return {
        kind: "array",
        item: walk(
          def.element,
          { optional: false, nullable: false },
          depth - 1,
          nextSeen,
        ),
        ...flags,
      };
    case "tuple": {
      if (!Array.isArray(def.items)) {
        return fallback(flags, `unsupported zod type "tuple"; defaulted to string`);
      }
      const elements = def.items.map((item) =>
        walk(item, { optional: false, nullable: false }, depth - 1, nextSeen),
      );
      // A variadic rest (z.tuple([...], z.string())) isn't a fixed shape; keep
      // the fixed head and flag the dropped rest. zod v4 leaves `rest` null
      // (not undefined) when there is none.
      const restTodo =
        def.rest !== undefined && def.rest !== null
          ? { todo: "tuple rest element is not generated; bind it by hand" }
          : {};
      return { kind: "tuple", elements, ...flags, ...restTodo };
    }
    case "optional":
      return walk(def.innerType, { ...flags, optional: true }, depth, nextSeen);
    case "nullable":
      return walk(def.innerType, { ...flags, nullable: true }, depth, nextSeen);
    // A .default() means the *input* may omit the value.
    case "default":
    case "prefault":
      return walk(def.innerType, { ...flags, optional: true }, depth, nextSeen);
    case "union": {
      const discriminated = discriminatedUnionFrom(
        def,
        flags,
        depth - 1,
        nextSeen,
      );
      if (discriminated !== null) return discriminated;
      const options = enumFromUnion(def.options);
      return options !== null
        ? { kind: "enum", options, ...flags }
        : fallback(
            flags,
            "unions other than string literals are not supported; defaulted to string",
          );
    }
    // Form values are typed as z.input, so a pipe's input side is the field.
    case "pipe":
      return walk(def.in, flags, depth, nextSeen);
    // .nonoptional() re-requires a possibly-optional inner schema: the
    // OUTER wrapper wins for z.input, so the inner optional must not
    // re-mark the field (a transparent unwrap here previously emitted
    // optional:true and a checked initialValues annotation that failed to
    // typecheck against the required input type).
    case "nonoptional": {
      const inner = walk(def.innerType, flags, depth, nextSeen);
      return { ...inner, optional: false };
    }
    default:
      // Wrappers we don't know by name but that carry an inner schema
      // (readonly, catch, ...) unwrap transparently.
      return def.innerType !== undefined
        ? walk(def.innerType, flags, depth, nextSeen)
        : fallback(
            flags,
            `unsupported zod type "${type}"; defaulted to string`,
          );
  }
};

export const fromZod = (
  schema: unknown,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): FieldSpec =>
  walk(schema, { optional: false, nullable: false }, maxDepth, new Set());
