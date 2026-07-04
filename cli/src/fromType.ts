import path from "node:path";
import ts from "typescript";
import { type FieldSpec, type NamedField, labelFromName } from "./ir";

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
const MAX_DEPTH = 6;

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

const unionSpec = (
  checker: ts.TypeChecker,
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
  const sole = rest[0];
  if (rest.length === 1 && sole !== undefined) {
    return walkType(checker, sole, next, depth);
  }
  return fallback(
    next,
    `unsupported union type "${checker.typeToString(type)}"; defaulted to string`,
  );
};

const objectFields = (
  checker: ts.TypeChecker,
  type: ts.Type,
  depth: number,
): readonly NamedField[] =>
  checker.getPropertiesOfType(type).map((prop): NamedField => {
    const propType = checker.getTypeOfSymbol(prop);
    const spec = walkType(checker, propType, NO_FLAGS, depth - 1);
    const optional =
      spec.optional || (prop.flags & ts.SymbolFlags.Optional) !== 0;
    return {
      name: prop.getName(),
      label: labelFromName(prop.getName()),
      spec: { ...spec, optional },
    };
  });

const walkType = (
  checker: ts.TypeChecker,
  type: ts.Type,
  flags: Flags,
  depth: number,
): FieldSpec => {
  if (depth <= 0) {
    return fallback(flags, "nesting depth limit reached; defaulted to string");
  }
  if (type.isUnion()) return unionSpec(checker, type, flags, depth);
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
  if (isArrayReference(checker, type)) {
    const element = checker.getTypeArguments(type as ts.TypeReference)[0];
    return element === undefined
      ? fallback(flags, "array element type not found; defaulted to string")
      : {
          kind: "array",
          item: walkType(checker, element, NO_FLAGS, depth - 1),
          ...flags,
        };
  }
  if (hasFlag(type, ts.TypeFlags.Object)) {
    return { kind: "object", fields: objectFields(checker, type, depth), ...flags };
  }
  return fallback(
    flags,
    `unsupported type "${checker.typeToString(type)}"; defaulted to string`,
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
      throw new Error(`no export named "${typeName}" in ${filePath}`);
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

export const fromType = (
  filePath: string,
  typeName?: string,
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
  const type = checker.getDeclaredTypeOfSymbol(resolved);
  return {
    ir: walkType(checker, type, NO_FLAGS, MAX_DEPTH),
    typeName: symbol.getName(),
  };
};
