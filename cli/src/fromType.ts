import path from "node:path";
import ts from "typescript";
import { NESTING_LIMIT_TODO } from "./depth";
import { DEFAULT_MAX_DEPTH } from "./fromZod";
import {
  type FieldSpec,
  type NamedField,
  type UnionVariant,
  labelFromName,
} from "./ir";

// TS compiler API frontend: point it at a file + an exported type/interface
// name and it walks the checker's view of the type into the same IR the zod
// frontend produces. Type-mode users get a generated zod schema too (see
// emitZodSchema in codegen.ts).

export type FromTypeResult = Readonly<{
  ir: FieldSpec;
  typeName: string;
}>;

type Flags = Readonly<{ optional: boolean; nullable: boolean }>;

const NO_FLAGS: Flags = { optional: false, nullable: false };
// The nesting budget default is fromZod's (derived from the FieldPath
// budget); overridable via fromType's maxDepth argument.

// The walk context: the checker, plus the object types on the CURRENT path
// (by checker identity: the checker interns a declared type, so every
// reference to `Tree` resolves to the same ts.Type object). The depth budget
// alone used to be the only brake on recursion, and `type Tree = { left?:
// Tree; right?: Tree }` expanded to the budget: 6142 IR nodes, a 188 KB
// file, 518 module files. A repeat on the path now degrades to the same
// recursion TODO the zod walker stamps on its getter idiom. Siblings may
// share a type (two `Address` members), so the set is per path, not global.
type Ctx = Readonly<{
  checker: ts.TypeChecker;
  seen: ReadonlySet<ts.Type>;
}>;

const fallback = (flags: Flags, todo: string): FieldSpec => ({
  kind: "string",
  ...flags,
  todo,
});

const isTypeSymbol = (symbol: ts.Symbol): boolean =>
  (symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)) !== 0;

const hasFlag = (type: ts.Type, flag: ts.TypeFlags): boolean =>
  (type.flags & flag) !== 0;

const isDateType = (type: ts.Type): boolean =>
  hasFlag(type, ts.TypeFlags.Object) && type.getSymbol()?.getName() === "Date";

const isArrayReference = (checker: ts.TypeChecker, type: ts.Type): boolean =>
  checker.isArrayType(type) ||
  (hasFlag(type, ts.TypeFlags.Object) &&
    type.getSymbol()?.getName() === "ReadonlyArray");

// The global `Function` interface declares apply/call/bind, not a call
// signature, so the signature check below misses it and the walk used to
// descend into Function.prototype (keys like `__@hasInstance@174`) to the
// budget. Named like Date is, by the lib symbol.
const isGlobalFunction = (type: ts.Type): boolean =>
  hasFlag(type, ts.TypeFlags.Object) &&
  type.getSymbol()?.getName() === "Function";

const isCallable = (type: ts.Type): boolean =>
  type.getCallSignatures().length > 0 ||
  type.getConstructSignatures().length > 0 ||
  isGlobalFunction(type);

// Object-like for the purposes of this walk: a plain object type, or an
// intersection of them (whose merged member set the checker hands out).
const isObjectLike = (type: ts.Type): boolean =>
  hasFlag(type, ts.TypeFlags.Object) ||
  (type.isIntersection() && type.types.every(isObjectLike));

const typeName = (ctx: Ctx, type: ts.Type): string =>
  ctx.checker.typeToString(type);

// The TS analogue of zod's `.describe()`: the member's leading JSDoc
// description (the free text before any @tags), straight off the property
// symbol the checker already has, no extra AST walk. Whitespace-only
// comments read as absent, mirroring fromZod's empty-describe rule.
const jsdocDescription = (
  checker: ts.TypeChecker,
  prop: ts.Symbol,
): string | undefined => {
  const text = ts
    .displayPartsToString(prop.getDocumentationComment(checker))
    .trim();
  return text === "" ? undefined : text;
};

// One member → one NamedField. `propType` is passed in rather than read off
// the symbol because an intersection may pick a constituent's declaration
// over the merged one (see intersectionFields); `extraTodo` is that case's
// conflict note, which wins over whatever the walk itself stamped.
const namedField = (
  ctx: Ctx,
  prop: ts.Symbol,
  propType: ts.Type,
  depth: number,
  extraTodo?: string,
): NamedField => {
  // A method or function-typed member is not a form field, but it used to
  // be dropped here without a trace, so the generated schema silently lost
  // a key of the type it claims to mirror. walkType's callable branch
  // turns it into the string-plus-TODO placeholder every other
  // unsupported shape gets (what the README and reference promise), so
  // the reader sees the member and decides what to do with it.
  const spec = walkType(ctx, propType, NO_FLAGS, depth - 1);
  const optional =
    spec.optional || (prop.flags & ts.SymbolFlags.Optional) !== 0;
  const description = jsdocDescription(ctx.checker, prop);
  return {
    name: prop.getName(),
    label: labelFromName(prop.getName()),
    spec: {
      ...spec,
      optional,
      ...(description === undefined ? {} : { description }),
      ...(extraTodo === undefined ? {} : { todo: extraTodo }),
    },
  };
};

const objectFields = (
  ctx: Ctx,
  type: ts.Type,
  depth: number,
  exclude: string | undefined = undefined,
): readonly NamedField[] =>
  ctx.checker
    .getPropertiesOfType(type)
    .filter((prop) => prop.getName() !== exclude)
    .map((prop) =>
      namedField(ctx, prop, ctx.checker.getTypeOfSymbol(prop), depth),
    );

// `A & B` walks to the merged member set, later wins on a name collision
// (the same rule allOf merging and `interface X extends Base` follow). The
// checker's merged property type for a collision is the INTERSECTION of
// the declarations (`"s" & number` is never), which no control can bind,
// so the field is walked as the last constituent's declaration and carries
// a TODO naming both sides, the reader resolves the contradiction.
const intersectionFields = (
  ctx: Ctx,
  type: ts.IntersectionType,
  depth: number,
): readonly NamedField[] =>
  ctx.checker.getPropertiesOfType(type).map((prop) => {
    const declared = type.types.flatMap((member) => {
      const own = ctx.checker.getPropertyOfType(member, prop.getName());
      return own === undefined ? [] : [ctx.checker.getTypeOfSymbol(own)];
    });
    const distinct = declared.filter(
      (candidate, index, all) => all.indexOf(candidate) === index,
    );
    const last = declared[declared.length - 1];
    return distinct.length > 1 && last !== undefined
      ? namedField(
          ctx,
          prop,
          last,
          depth,
          `intersection members disagree on "${prop.getName()}" (${distinct
            .map((candidate) => typeName(ctx, candidate))
            .join(", ")}); kept the last one, reconcile the type`,
        )
      : namedField(ctx, prop, ctx.checker.getTypeOfSymbol(prop), depth);
  });

// The single string-literal value of a member's property, or undefined
// when the property is missing, optional, or not a lone literal.
const literalTagOf = (
  ctx: Ctx,
  member: ts.Type,
  key: string,
): string | undefined => {
  const prop = ctx.checker.getPropertyOfType(member, key);
  if (prop === undefined) return undefined;
  const propType = ctx.checker.getTypeOfSymbol(prop);
  return propType.isStringLiteral() ? propType.value : undefined;
};

// The discriminant of a union of object types: the first key (in the
// first member's declaration order) that every member types as a lone
// string literal, with pairwise-distinct values. Same shape
// z.discriminatedUnion and OpenAPI's `discriminator` walk to.
const discriminantOf = (
  ctx: Ctx,
  members: readonly ts.Type[],
): string | undefined => {
  const first = members[0];
  if (first === undefined) return undefined;
  return ctx.checker
    .getPropertiesOfType(first)
    .map((prop) => prop.getName())
    .find((key) => {
      const tags = members.map((member) => literalTagOf(ctx, member, key));
      return (
        tags.every((tag): tag is string => tag !== undefined) &&
        new Set(tags).size === tags.length
      );
    });
};

const discriminatedUnionSpec = (
  ctx: Ctx,
  type: ts.UnionType,
  members: readonly ts.Type[],
  flags: Flags,
  depth: number,
): FieldSpec => {
  const discriminant = discriminantOf(ctx, members);
  if (discriminant === undefined) {
    return fallback(
      flags,
      `union of object types "${typeName(ctx, type)}" has no shared string-literal discriminant; defaulted to string`,
    );
  }
  // The discriminant binds as a plain (common) field; the branch's OTHER
  // members are the variant fields useVariantField reaches. Each branch
  // joins the path's seen-set like any object the walk enters.
  const variants = members.map((member): UnionVariant => {
    const tag = literalTagOf(ctx, member, discriminant) ?? "";
    const branchCtx: Ctx = { ...ctx, seen: new Set([...ctx.seen, member]) };
    return {
      tag,
      label: labelFromName(tag),
      fields: objectFields(branchCtx, member, depth, discriminant),
    };
  });
  return { kind: "union", discriminant, variants, ...flags };
};

const unionSpec = (
  ctx: Ctx,
  type: ts.UnionType,
  flags: Flags,
  depth: number,
): FieldSpec => {
  const optional =
    flags.optional || type.types.some((t) => hasFlag(t, ts.TypeFlags.Undefined));
  const nullable =
    flags.nullable || type.types.some((t) => hasFlag(t, ts.TypeFlags.Null));
  const rest = type.types.filter(
    (t) => !hasFlag(t, ts.TypeFlags.Undefined | ts.TypeFlags.Null),
  );
  const next: Flags = { optional, nullable };
  if (rest.length === 0) {
    return fallback(next, "type is only null/undefined; defaulted to string");
  }
  // `boolean` in a union is represented as its two literals.
  if (rest.every((t) => hasFlag(t, ts.TypeFlags.BooleanLiteral))) {
    return { kind: "boolean", ...next };
  }
  if (rest.every((t) => t.isStringLiteral())) {
    return {
      kind: "enum",
      options: rest
        .filter((t): t is ts.StringLiteralType => t.isStringLiteral())
        .map((t) => t.value),
      ...next,
    };
  }
  // The IR enum is string-only (a select's option values are strings), so
  // `1 | 2 | 3` has no control; the TODO says why rather than "unsupported".
  if (rest.every((t) => hasFlag(t, ts.TypeFlags.NumberLiteral))) {
    return fallback(
      next,
      `union of numeric literals "${typeName(ctx, type)}" is not supported (the generated enum is string-only); defaulted to string`,
    );
  }
  const sole = rest[0];
  if (rest.length === 1 && sole !== undefined) {
    return walkType(ctx, sole, next, depth);
  }
  if (rest.every(isObjectLike)) {
    return discriminatedUnionSpec(ctx, type, rest, next, depth);
  }
  return fallback(
    next,
    `unsupported union type "${typeName(ctx, type)}"; defaulted to string`,
  );
};

// An object-like type's spec: callable, record-like, mixed, or a section.
// The type joins the seen-set for its children, so a member typed as this
// same type (directly or through an array/optional wrapper) cuts off.
const objectSpec = (
  ctx: Ctx,
  type: ts.Type,
  flags: Flags,
  depth: number,
): FieldSpec => {
  // A callable/constructable type is not a data object, surface the whole
  // field as a todo instead of walking its properties.
  if (isCallable(type)) {
    return fallback(
      flags,
      `callable type "${typeName(ctx, type)}" is not supported; defaulted to string`,
    );
  }
  if (ctx.seen.has(type)) {
    return fallback(
      flags,
      `recursive type "${typeName(ctx, type)}"; defaulted to string`,
    );
  }
  const props = ctx.checker.getPropertiesOfType(type);
  const indexInfos = ctx.checker.getIndexInfosOfType(type);
  // Record<string, number> and friends have an index signature and no
  // named properties: there is no fixed key to bind a control to, so an
  // empty section (what z.object({}) would become) is a lie about the
  // type. Same TODO the zod walker gives z.record.
  if (props.length === 0 && indexInfos.length > 0) {
    return fallback(
      flags,
      `record type "${typeName(ctx, type)}" has no fixed keys to bind; defaulted to string`,
    );
  }
  const nextCtx: Ctx = { ...ctx, seen: new Set([...ctx.seen, type]) };
  const fields = type.isIntersection()
    ? intersectionFields(nextCtx, type, depth)
    : objectFields(nextCtx, type, depth);
  // Named members beside an index signature: the members bind, the open
  // key set cannot (same reason as the record case), and the signature
  // used to vanish without a trace. The TODO sits on the section so the
  // schema comment, the stderr mirror, and the spec's skip all see it.
  const indexTodo =
    indexInfos.length === 0
      ? {}
      : {
          todo: `index signature ${indexInfos
            .map(
              (info) =>
                `[key: ${typeName(ctx, info.keyType)}]: ${typeName(ctx, info.type)}`,
            )
            .join(", ")} is not generated; the named members are, bind the extra keys by hand`,
        };
  return { kind: "object", fields, ...flags, ...indexTodo };
};

const walkType = (
  ctx: Ctx,
  type: ts.Type,
  flags: Flags,
  depth: number,
): FieldSpec => {
  const { checker } = ctx;
  if (depth <= 0) {
    return fallback(flags, NESTING_LIMIT_TODO);
  }
  if (type.isUnion()) return unionSpec(ctx, type, flags, depth);
  if (hasFlag(type, ts.TypeFlags.String)) return { kind: "string", ...flags };
  if (type.isStringLiteral()) {
    return { kind: "enum", options: [type.value], ...flags };
  }
  if (hasFlag(type, ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
    return { kind: "number", ...flags };
  }
  if (hasFlag(type, ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
    return { kind: "boolean", ...flags };
  }
  if (isDateType(type)) return { kind: "date", ...flags };
  // Tuples are not isArrayType; without this check they would fall through to
  // the object branch and leak Array.prototype members as fields. Each element
  // becomes a positional FieldSpec (bound at a static numeric-index path).
  if (checker.isTupleType(type)) {
    const elements = checker.getTypeArguments(type as ts.TypeReference);
    return {
      kind: "tuple",
      elements: elements.map((element) =>
        walkType(ctx, element, NO_FLAGS, depth - 1),
      ),
      ...flags,
    };
  }
  if (isArrayReference(checker, type)) {
    const element = checker.getTypeArguments(type as ts.TypeReference)[0];
    return element === undefined
      ? fallback(flags, "array element type not found; defaulted to string")
      : {
          kind: "array",
          item: walkType(ctx, element, NO_FLAGS, depth - 1),
          ...flags,
        };
  }
  // `A & B` has TypeFlags.Intersection, not Object, so it used to fall to
  // "unsupported type" while `interface X extends Base` walked fine.
  if (isObjectLike(type)) return objectSpec(ctx, type, flags, depth);
  return fallback(
    flags,
    `unsupported type "${typeName(ctx, type)}"; defaulted to string`,
  );
};

const pickSymbol = (
  exports: readonly ts.Symbol[],
  typeName: string | undefined,
  filePath: string,
): ts.Symbol => {
  if (typeName !== undefined) {
    const named = exports.find((s) => s.getName() === typeName);
    if (named === undefined) {
      const available = exports.map((s) => s.getName()).join(", ");
      throw new Error(
        `no export named "${typeName}" in ${filePath} (available: ${available.length === 0 ? "none" : available})`,
      );
    }
    return named;
  }
  const typeExports = exports.filter(isTypeSymbol);
  const sole = typeExports[0];
  if (typeExports.length === 1 && sole !== undefined) return sole;
  if (typeExports.length === 0) {
    throw new Error(`no exported type or interface found in ${filePath}`);
  }
  throw new Error(
    `multiple exported types in ${filePath} (${typeExports
      .map((s) => s.getName())
      .join(", ")}); pick one with --type`,
  );
};

// What `--type` was pointed at when it is not a type: the declaration kind
// in plain words for the error. Classes and enums declare a type too, so
// they are not refused here (a class walks as its instance type).
const DECLARES_A_TYPE =
  ts.SymbolFlags.TypeAlias |
  ts.SymbolFlags.Interface |
  ts.SymbolFlags.Class |
  ts.SymbolFlags.Enum;

const symbolKind = (symbol: ts.Symbol): string =>
  (symbol.flags & ts.SymbolFlags.Variable) !== 0
    ? "a variable"
    : (symbol.flags & ts.SymbolFlags.Function) !== 0
      ? "a function"
      : (symbol.flags & (ts.SymbolFlags.Module | ts.SymbolFlags.Namespace)) !== 0
        ? "a namespace"
        : "not a type";

export const fromType = (
  filePath: string,
  typeName?: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): FromTypeResult => {
  const absPath = path.resolve(filePath);
  const program = ts.createProgram([absPath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const source = program
    .getSourceFiles()
    .find((sf) => path.resolve(sf.fileName) === absPath);
  if (source === undefined) {
    throw new Error(`could not load ${filePath}`);
  }
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const exports =
    moduleSymbol !== undefined ? checker.getExportsOfModule(moduleSymbol) : [];
  const symbol = pickSymbol(exports, typeName, filePath);
  const resolved =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  // A value export (`--type someConst`) has no declared type: the checker
  // answers with the error type, which walked to an "any" TODO form that
  // looked like a generator bug. It is operator input, so it throws.
  if ((resolved.flags & DECLARES_A_TYPE) === 0) {
    throw new Error(
      `"${symbol.getName()}" in ${filePath} is ${symbolKind(resolved)}, not a type or interface (pass a type alias or interface to --type; a zod export is picked with --export)`,
    );
  }
  const type = checker.getDeclaredTypeOfSymbol(resolved);
  return {
    ir: walkType({ checker, seen: new Set() }, type, NO_FLAGS, maxDepth),
    typeName: symbol.getName(),
  };
};
