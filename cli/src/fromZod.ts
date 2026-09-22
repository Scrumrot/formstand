import { FORMSTAND_PATH_DEPTH, NESTING_LIMIT_TODO } from "./depth";
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
  // zod v4's top-level string formats (z.email() etc.) keep type "string"
  // and carry the format name here; .string().email() does NOT (its check
  // lives in the checks array), so only the top-level spellings round-trip.
  format?: unknown;
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
  // z.default / z.prefault: the default. In zod v4 this is a getter that
  // resolves the user's factory to its value; other versions store the
  // factory function itself (which the walk treats as not capturable).
  defaultValue?: unknown;
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

// The schema's registered description, duck-typed. In zod v4, `.describe(text)`
// is sugar for `.meta({ description: text })`: both write ONE registry entry
// (z.globalRegistry, keyed by schema object identity — nothing lands on
// `def`), surfaced by the `description` getter on the schema itself. Reading
// the getter consults the USER's registry through their own schema object, so
// the dual-package hazard doesn't apply. Precedence is therefore simply "the
// last .describe()/.meta() call on that schema object wins"; other .meta()
// keys (title, examples, ...) are ignored. A wrapper (.optional() etc.) is a
// NEW schema object with its own (usually absent) entry — walk() prefers the
// outermost entry present. The getter can be user code (registries are
// extensible), so a throwing read means "no description"; an empty or
// whitespace-only string is treated as absent.
const descriptionOf = (schema: unknown): string | undefined => {
  try {
    const value = (schema as Readonly<{ description?: unknown }>).description;
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  } catch {
    return undefined;
  }
};

// Duck-typed read of zod v4's checks array: each check's plain payload
// lives at entry._zod.def ({ check: "min_length", minimum: 3 },
// { check: "greater_than", value: 18, inclusive: true }, ...). Unknown
// check kinds are ignored on purpose — bounds are an enrichment the
// emitters and generated tests consume, never a gate on walking.
const checkDefs = (
  def: Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] => {
  const raw = def["checks"];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): readonly Readonly<Record<string, unknown>>[] => {
    const inner =
      (entry as Readonly<{ _zod?: Readonly<{ def?: unknown }> }>)._zod?.def ??
      entry;
    return typeof inner === "object" && inner !== null
      ? [inner as Readonly<Record<string, unknown>>]
      : [];
  });
};

const finiteOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

// min_length / max_length / length_equals — shared by strings and arrays.
// Repeated checks keep the TIGHTEST bound (zod applies all of them).
const lengthChecksOf = (
  def: Readonly<Record<string, unknown>>,
): Readonly<{ minLength?: number; maxLength?: number }> | undefined => {
  const collected = checkDefs(def).reduce<{
    minLength?: number;
    maxLength?: number;
  }>((acc, check) => {
    switch (check["check"]) {
      case "min_length": {
        const minimum = finiteOf(check["minimum"]);
        return minimum === undefined
          ? acc
          : { ...acc, minLength: Math.max(acc.minLength ?? minimum, minimum) };
      }
      case "max_length": {
        const maximum = finiteOf(check["maximum"]);
        return maximum === undefined
          ? acc
          : { ...acc, maxLength: Math.min(acc.maxLength ?? maximum, maximum) };
      }
      case "length_equals": {
        const length = finiteOf(check["length"]);
        return length === undefined
          ? acc
          : { ...acc, minLength: length, maxLength: length };
      }
      default:
        return acc;
    }
  }, {});
  return collected.minLength === undefined && collected.maxLength === undefined
    ? undefined
    : collected;
};

// The number formats zod treats as integers: a bare z.int() is a
// ZodNumberFormat whose def.format is "safeint" and whose checks array is
// EMPTY (the format itself is the check), while .int() on a plain number
// appends a number_format check carrying the same format string. Both
// spellings must land as int: true, so the format is read in both places.
const INT_FORMATS: ReadonlySet<unknown> = new Set(["safeint", "int32", "uint32"]);

// A tighter bound replaces the previous edge AND its exclusivity flag; a
// rest-destructure would do it, but the lint forbids the unused binding.
const withoutKey = <T extends object, K extends keyof T>(
  obj: T,
  key: K,
): Omit<T, K> =>
  Object.fromEntries(
    Object.entries(obj).filter(([name]) => name !== key),
  ) as Omit<T, K>;

// greater_than / less_than (value + inclusive) and the integer formats
// (see INT_FORMATS). A tie between an inclusive and an exclusive bound at
// the same value keeps the exclusive one, the stricter of the two.
const numberChecksOf = (
  def: Readonly<Record<string, unknown>>,
):
  | Readonly<{
      min?: number;
      max?: number;
      minExclusive?: true;
      maxExclusive?: true;
      int?: true;
    }>
  | undefined => {
  const collected = checkDefs(def).reduce<{
    min?: number;
    max?: number;
    minExclusive?: true;
    maxExclusive?: true;
    int?: true;
  }>((acc, check) => {
    switch (check["check"]) {
      case "greater_than": {
        const value = finiteOf(check["value"]);
        const exclusive = check["inclusive"] !== true;
        const looser =
          acc.min !== undefined &&
          (value === undefined ||
            value < acc.min ||
            (value === acc.min && (acc.minExclusive === true || !exclusive)));
        if (value === undefined || looser) return acc;
        return {
          ...withoutKey(acc, "minExclusive"),
          min: value,
          ...(exclusive ? { minExclusive: true as const } : {}),
        };
      }
      case "less_than": {
        const value = finiteOf(check["value"]);
        const exclusive = check["inclusive"] !== true;
        const looser =
          acc.max !== undefined &&
          (value === undefined ||
            value > acc.max ||
            (value === acc.max && (acc.maxExclusive === true || !exclusive)));
        if (value === undefined || looser) return acc;
        return {
          ...withoutKey(acc, "maxExclusive"),
          max: value,
          ...(exclusive ? { maxExclusive: true as const } : {}),
        };
      }
      case "number_format":
        return INT_FORMATS.has(check["format"]) ? { ...acc, int: true } : acc;
      default:
        return acc;
    }
  }, INT_FORMATS.has(def["format"]) ? { int: true } : {});
  return Object.keys(collected).length === 0 ? undefined : collected;
};

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

// The default nesting budget (fromType shares it), DERIVED from the
// FieldPath budget: the walker must reach one level PAST the path budget so
// that a leaf of up to pathBudget + 1 segments degrades via the PATH budget
// (a real subtree, materialized in the schema/initialValues, with a depth
// TODO at the boundary) rather than via walker truncation. A 9-segment
// object needs its 10-segment children walked truly, and the root spends
// one level, hence budget + 2 (= 11 at the default budget of 9). Leaves
// DEEPER than that (11+ segments at default flags) still truncate to the
// string-kind stand-in (NESTING_LIMIT_TODO) — possibly with the wrong
// kind/flags, since the fallback fires before wrappers unwrap — which is
// why blankNeedsCast forces the initialValues cast for any required
// todo-bearing leaf and the CLI mirrors every truncated path as a stderr
// warning.
// Also the backstop for recursion the seen-set misses (getters that build a
// fresh schema object on every access) — the walk always terminates even
// for a truly cyclic schema. Overridable via fromZod's maxDepth argument
// (the CLI's --max-depth).
export const DEFAULT_MAX_DEPTH = FORMSTAND_PATH_DEPTH + 2;

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
//
// Description capture wraps the node walk: the recursion attaches the inner
// schema's description first, then each unwinding wrapper level overrides
// with its own entry when present — so for both
// `z.number().describe("x").optional()` (entry on the inner number) and
// `z.number().optional().describe("x")` (entry on the outer optional) the
// OUTERMOST entry present wins.
const walk = (
  schema: unknown,
  flags: Flags,
  depth: number,
  seen: ReadonlySet<unknown>,
): FieldSpec => {
  const spec = walkNode(schema, flags, depth, seen);
  const description =
    defOf(schema) !== null ? descriptionOf(schema) : undefined;
  return description === undefined ? spec : { ...spec, description };
};

const walkNode = (
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
    return fallback(flags, NESTING_LIMIT_TODO);
  }
  const nextSeen: ReadonlySet<unknown> = new Set([...seen, schema]);
  const type = typeof def.type === "string" ? def.type : "<unknown>";
  switch (type) {
    case "string": {
      // Carry the three formats the generated schema can emit back
      // (emitZodSchema round-trips them as z.email()/z.url()/z.uuid());
      // other formats (ipv4, emoji, ...) stay plain strings.
      const format = def.format;
      const checks = lengthChecksOf(def);
      return {
        kind: "string",
        ...(format === "email" || format === "url" || format === "uuid"
          ? { format }
          : {}),
        ...(checks === undefined ? {} : { checks }),
        ...flags,
      };
    }
    case "number":
    case "int": {
      const checks = numberChecksOf(def);
      return {
        kind: "number",
        ...(checks === undefined ? {} : { checks }),
        ...flags,
      };
    }
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
    case "array": {
      const checks = lengthChecksOf(def);
      return {
        kind: "array",
        item: walk(
          def.element,
          { optional: false, nullable: false },
          depth - 1,
          nextSeen,
        ),
        ...(checks === undefined ? {} : { checks }),
        ...flags,
      };
    }
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
    // A .default() means the *input* may omit the value — and the wrapped
    // value is what the generated initialValues should start from. zod v4's
    // `def.defaultValue` is a GETTER that already resolves the user's
    // factory, so it is read, never invoked: a function-valued result (an
    // older shape storing the factory itself, or a factory returning a
    // function) means "not capturable" — calling it would execute arbitrary
    // user code at generation time. And a non-deterministic factory
    // (Date.now, randomUUID) must not bake a run-dependent value into
    // byte-deterministic output: the getter is read TWICE, and the value is
    // captured only when both reads agree (Object.is) on a JSON primitive.
    // A throwing getter is "no capturable default".
    case "default":
    case "prefault": {
      const inner = walk(
        def.innerType,
        { ...flags, optional: true },
        depth,
        nextSeen,
      );
      const read = (): unknown => {
        try {
          return def.defaultValue;
        } catch {
          return undefined;
        }
      };
      const first = read();
      const capturable =
        (typeof first === "string" ||
          typeof first === "number" ||
          typeof first === "boolean") &&
        Object.is(first, read());
      // A refused capture is never silent: the marker lets the CLI mirror
      // the degradation on stderr (the field starts blank despite its
      // .default()). Captured values can still be refused later at emit
      // time — droppedDefaultFieldPaths covers those off `defaultValue`.
      return capturable
        ? { ...inner, defaultValue: first }
        : { ...inner, droppedDefault: true };
    }
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
