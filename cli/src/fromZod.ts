import { FORMSTAND_PATH_DEPTH, NESTING_LIMIT_TODO } from "./depth";
import {
  type FieldSpec,
  type NamedField,
  type StringFormat,
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
  // and carry the format name here; .string().email() carries it as a
  // string_format check instead (see methodFormatOf), both spellings land
  // as the same StringFormat.
  format?: unknown;
  // z.coerce.*: the parser coerces ANY input, so z.input is `unknown`
  // whatever `type` says. The walk degrades it rather than trust the type.
  coerce?: unknown;
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
// (z.globalRegistry, keyed by schema object identity, nothing lands on
// `def`), surfaced by the `description` getter on the schema itself. Reading
// the getter consults the USER's registry through their own schema object, so
// the dual-package hazard doesn't apply. Precedence is therefore simply "the
// last .describe()/.meta() call on that schema object wins"; other .meta()
// keys (title, examples, ...) are ignored. A wrapper (.optional() etc.) is a
// NEW schema object with its own (usually absent) entry, walk() prefers the
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
// check kinds never gate the walk (bounds are an enrichment the emitters
// and generated tests consume), but they are RECORDED on the spec as
// unmodeledChecks, so the generated spec knows its blind sample may fail.
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

// min_length / max_length / length_equals, shared by strings and arrays.
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

type CheckDef = Readonly<Record<string, unknown>>;

// The string formats the IR carries (StringFormat). zod spells them two
// ways: z.email() puts "email" on def.format, .string().email() appends a
// string_format check whose format is "email". Both reach the same spec.
const STRING_FORMATS: ReadonlySet<unknown> = new Set(["email", "url", "uuid"]);

const asStringFormat = (value: unknown): StringFormat | undefined =>
  STRING_FORMATS.has(value) ? (value as StringFormat) : undefined;

// The method-form format, if any: the first string_format check naming a
// format the IR carries. Other string_format checks (regex, starts_with,
// ipv4, ...) are not formats the schema emitter can round-trip; they are
// reported as unmodeled below.
const methodFormatOf = (def: CheckDef): StringFormat | undefined =>
  checkDefs(def)
    .filter((check) => check["check"] === "string_format")
    .map((check) => asStringFormat(check["format"]))
    .find((format) => format !== undefined);

// Which checks each node kind models, by zod's own discriminant. "overwrite"
// (trim, toLowerCase, normalize) transforms and never rejects, so it is
// harmless everywhere; everything else outside its kind's set is a check
// the generated spec's sample cannot be trusted against.
const isModeledStringCheck = (check: CheckDef): boolean =>
  check["check"] === "min_length" ||
  check["check"] === "max_length" ||
  check["check"] === "length_equals" ||
  check["check"] === "overwrite" ||
  (check["check"] === "string_format" && STRING_FORMATS.has(check["format"]));

const isModeledNumberCheck = (check: CheckDef): boolean =>
  check["check"] === "greater_than" ||
  check["check"] === "less_than" ||
  check["check"] === "overwrite" ||
  (check["check"] === "number_format" && INT_FORMATS.has(check["format"]));

const isModeledArrayCheck = (check: CheckDef): boolean =>
  check["check"] === "min_length" ||
  check["check"] === "max_length" ||
  check["check"] === "length_equals" ||
  check["check"] === "overwrite";

// Kinds whose checks the walk never reads: a date bound, a refine on a
// boolean or enum or object. Only the harmless overwrite is modeled.
const isHarmlessCheck = (check: CheckDef): boolean =>
  check["check"] === "overwrite";

// A check's reportable name: zod's discriminant, except the parameterized
// pair where the parameter is what the reader needs ("regex" or "ipv4"
// rather than "string_format", "float32" rather than "number_format").
const checkName = (check: CheckDef): string => {
  const kind = check["check"];
  const format = check["format"];
  return (kind === "string_format" || kind === "number_format") &&
    typeof format === "string"
    ? format
    : typeof kind === "string"
      ? kind
      : "unknown";
};

// The unmodeledChecks spread for a node: every check its kind does not
// model, plus `extra` names the caller found outside the checks array (a
// top-level string format the IR cannot carry). Deduped, first-seen order,
// absent when empty so modeled-only specs stay byte-identical.
const unmodeledChecksOf = (
  def: CheckDef,
  isModeled: (check: CheckDef) => boolean,
  extra: readonly string[] = [],
): Readonly<{ unmodeledChecks?: readonly string[] }> => {
  const names = [
    ...extra,
    ...checkDefs(def)
      .filter((check) => !isModeled(check))
      .map(checkName),
  ].filter((name, index, all) => all.indexOf(name) === index);
  return names.length === 0 ? {} : { unmodeledChecks: names };
};

// A wrapper (.optional(), .default(), .nullable(), ...) can carry its own
// checks (`z.string().optional().refine(...)` refines the OPTIONAL): merge
// them into the unwrapped spec's list, the wrapper's checks never modeled.
const withWrapperChecks = (def: CheckDef, inner: FieldSpec): FieldSpec => {
  const own = unmodeledChecksOf(def, isHarmlessCheck).unmodeledChecks ?? [];
  if (own.length === 0) return inner;
  const merged = [...(inner.unmodeledChecks ?? []), ...own].filter(
    (name, index, all) => all.indexOf(name) === index,
  );
  return { ...inner, unmodeledChecks: merged };
};

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
// or a multi-value literal, none of which name a discriminant branch).
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
// string-kind stand-in (NESTING_LIMIT_TODO), possibly with the wrong
// kind/flags, since the fallback fires before wrappers unwrap, which is
// why blankNeedsCast forces the initialValues cast for any required
// todo-bearing leaf and the CLI mirrors every truncated path as a stderr
// warning.
// Also the backstop for recursion the seen-set misses (getters that build a
// fresh schema object on every access), the walk always terminates even
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
// with its own entry when present, so for both
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
  // z.coerce.number() keeps type "number" but parses ANY input, so z.input
  // is `unknown`: a number control bound to it fails typecheck (the path is
  // not number-valued), and a number sample proves nothing about what the
  // form holds. Degrade before the kind switch can trust the type.
  if (def.coerce === true) {
    return fallback(
      flags,
      `z.coerce.${type}() is not supported: the input type is unknown, bind it by hand`,
    );
  }
  switch (type) {
    case "string": {
      // Carry the three formats the generated schema can emit back
      // (emitZodSchema round-trips them as z.email()/z.url()/z.uuid()),
      // from either spelling (z.email() on the def, .string().email() as a
      // check). Other formats (ipv4, emoji, ...) stay plain strings and are
      // reported as unmodeled, the spec's sample cannot satisfy them.
      const format = asStringFormat(def.format) ?? methodFormatOf(def);
      const checks = lengthChecksOf(def);
      const unknownTopLevelFormat =
        typeof def.format === "string" && asStringFormat(def.format) === undefined
          ? [def.format]
          : [];
      return {
        kind: "string",
        ...(format === undefined ? {} : { format }),
        ...(checks === undefined ? {} : { checks }),
        ...unmodeledChecksOf(def, isModeledStringCheck, unknownTopLevelFormat),
        ...flags,
      };
    }
    case "number":
    case "int": {
      const checks = numberChecksOf(def);
      return {
        kind: "number",
        ...(checks === undefined ? {} : { checks }),
        ...unmodeledChecksOf(def, isModeledNumberCheck),
        ...flags,
      };
    }
    case "boolean":
      return {
        kind: "boolean",
        ...unmodeledChecksOf(def, isHarmlessCheck),
        ...flags,
      };
    // A date's .min()/.max() are greater_than/less_than checks the IR has
    // no slot for (DateChecks does not exist), so they report as unmodeled.
    case "date":
      return {
        kind: "date",
        ...unmodeledChecksOf(def, isHarmlessCheck),
        ...flags,
      };
    case "enum": {
      const entries =
        typeof def.entries === "object" && def.entries !== null
          ? Object.entries(def.entries as Readonly<Record<string, unknown>>)
          : [];
      const options = stringValues(entries.map(([, value]) => value));
      // A TypeScript enum object maps names to values (Red -> "red"); a
      // z.enum([...]) list maps each value to itself. The distinction is
      // what tells the emitters z.input is the enum TYPE (see ir.ts).
      const tsEnum = entries.some(([key, value]) => key !== value);
      // zod constructs z.enum([]) without complaint and then rejects every
      // value, so a select with no option and a schema no submit can pass
      // would be emitted as if it were fine. Named instead.
      if (options !== null && options.length === 0) {
        return fallback(
          flags,
          "empty enum has no option to choose from; defaulted to string",
        );
      }
      return options !== null
        ? {
            kind: "enum",
            options,
            ...(tsEnum ? { tsEnum: true as const } : {}),
            ...unmodeledChecksOf(def, isHarmlessCheck),
            ...flags,
          }
        : fallback(flags, "non-string enum; defaulted to string");
    }
    case "literal": {
      const options = stringValues(def.values);
      return options !== null
        ? { kind: "enum", options, ...flags }
        : fallback(flags, "non-string literal; defaulted to string");
    }
    // An object-level .refine() (a cross-field rule) is a custom check on
    // the object def: the spec's sample is built field by field and cannot
    // know the rule, so it reports as unmodeled at the object's path.
    case "object":
      return {
        kind: "object",
        fields: fieldsFromShape(def.shape, depth - 1, nextSeen),
        ...unmodeledChecksOf(def, isHarmlessCheck),
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
        ...unmodeledChecksOf(def, isModeledArrayCheck),
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
      return withWrapperChecks(
        def,
        walk(def.innerType, { ...flags, optional: true }, depth, nextSeen),
      );
    case "nullable":
      return withWrapperChecks(
        def,
        walk(def.innerType, { ...flags, nullable: true }, depth, nextSeen),
      );
    // A .default() means the *input* may omit the value, and the wrapped
    // value is what the generated initialValues should start from. zod v4's
    // `def.defaultValue` is a GETTER that already resolves the user's
    // factory, so it is read, never invoked: a function-valued result (an
    // older shape storing the factory itself, or a factory returning a
    // function) means "not capturable", calling it would execute arbitrary
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
      // time, droppedDefaultFieldPaths covers those off `defaultValue`.
      return withWrapperChecks(
        def,
        capturable
          ? { ...inner, defaultValue: first }
          : { ...inner, droppedDefault: true },
      );
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
      return withWrapperChecks(def, { ...inner, optional: false });
    }
    default:
      // Wrappers we don't know by name but that carry an inner schema
      // (readonly, catch, ...) unwrap transparently.
      return def.innerType !== undefined
        ? withWrapperChecks(def, walk(def.innerType, flags, depth, nextSeen))
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
