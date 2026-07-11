import {
  type FieldSpec,
  type NamedField,
  labelFromName,
} from "../../../../cli/src/codegen-api";

// A focused parser for the TS-interface subset the CLI's type mode supports —
// enough to paste an interface and generate a form, WITHOUT pulling the
// multi-megabyte TypeScript compiler into the playground. It handles what
// fromType handles (string/number/boolean/Date, arrays, nested objects,
// string-literal unions, optional/nullable) and degrades the rest to a
// string field, mirroring the CLI's own fallback. Recursive descent over a
// tiny token stream; pure, so it runs anywhere and is unit-tested directly.

export type ParseResult =
  | Readonly<{ ok: true; formName: string; ir: FieldSpec }>
  | Readonly<{ ok: false; error: string }>;

type Token = Readonly<{ kind: "ident" | "string" | "punct"; value: string }>;

// Strip line/block comments, then split into identifiers, string literals
// (single/double), and single-char punctuation. Whitespace separates.
const tokenize = (source: string): readonly Token[] => {
  const noComments = source
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  const tokens: Token[] = [];
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_$][\w$]*)|([{}[\]<>();,|?:])/g;
  const push = (t: Token) => tokens.push(t);
  Array.from(noComments.matchAll(re)).forEach((m) => {
    if (m[1] !== undefined) push({ kind: "string", value: m[1].slice(1, -1) });
    else if (m[2] !== undefined) push({ kind: "ident", value: m[2] });
    else if (m[3] !== undefined) push({ kind: "punct", value: m[3] });
  });
  return tokens;
};

// A cursor is threaded through the recursive descent as an index into the
// token array; helpers return the next state alongside their result (no
// mutation — the parser is a fold over tokens).
type Cursor = Readonly<{ tokens: readonly Token[]; i: number }>;

const peek = (c: Cursor): Token | undefined => c.tokens[c.i];
const advance = (c: Cursor): Cursor => ({ ...c, i: c.i + 1 });

const isPunct = (c: Cursor, value: string): boolean => {
  const t = peek(c);
  return t !== undefined && t.kind === "punct" && t.value === value;
};

// Merge optional/nullable flags collected from `?` and `| null | undefined`
// onto a spec (the leaf keeps its own kind).
const withFlags = (
  spec: FieldSpec,
  optional: boolean,
  nullable: boolean,
): FieldSpec => ({ ...spec, optional, nullable });

// Kinds base() constructs — every FieldSpec kind except "union" (paste-TS
// does not detect discriminated unions).
type BaseKind = Exclude<FieldSpec["kind"], "union">;

const KEYWORD_SPECS: Readonly<Record<string, BaseKind>> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  Date: "date",
};

type TypeParse = Readonly<{ cursor: Cursor; spec: FieldSpec }>;

// A single (non-union, pre-postfix) type: a keyword leaf, a nested object,
// an Array<T>, a string literal (its own one-option enum, merged by the
// union layer), or a parenthesized group. Unknown identifiers degrade to a
// string leaf with a todo.
const parsePrimary = (c: Cursor): TypeParse => {
  const t = peek(c);
  if (t === undefined) {
    return { cursor: c, spec: base("string", "unexpected end of type") };
  }
  if (isPunct(c, "{")) return parseObjectType(c);
  if (isPunct(c, "(")) {
    const inner = parseType(advance(c));
    // consume the ")"
    const after = isPunct(inner.cursor, ")")
      ? advance(inner.cursor)
      : inner.cursor;
    return { cursor: after, spec: inner.spec };
  }
  if (t.kind === "string") {
    return { cursor: advance(c), spec: { kind: "enum", options: [t.value], optional: false, nullable: false } };
  }
  if (t.kind === "ident") {
    if (t.value === "Array" && isPunct(advance(c), "<")) {
      const item = parseType(advance(advance(c)));
      const after = isPunct(item.cursor, ">") ? advance(item.cursor) : item.cursor;
      return { cursor: after, spec: { kind: "array", item: item.spec, optional: false, nullable: false } };
    }
    const kind = KEYWORD_SPECS[t.value];
    return kind !== undefined
      ? { cursor: advance(c), spec: base(kind) }
      : {
          cursor: advance(c),
          spec: base("string", `unsupported type "${t.value}"; defaulted to string`),
        };
  }
  return { cursor: advance(c), spec: base("string", "unrecognized type") };
};

const base = (kind: BaseKind, todo?: string): FieldSpec => {
  switch (kind) {
    case "enum":
      return { kind: "enum", options: [], optional: false, nullable: false, ...(todo ? { todo } : {}) };
    case "object":
      return { kind: "object", fields: [], optional: false, nullable: false, ...(todo ? { todo } : {}) };
    case "array":
      return { kind: "array", item: base("string"), optional: false, nullable: false, ...(todo ? { todo } : {}) };
    default:
      return { kind, optional: false, nullable: false, ...(todo ? { todo } : {}) };
  }
};

// Apply postfix `[]` (possibly repeated: string[][]) to a primary.
const parsePostfix = (start: TypeParse): TypeParse => {
  const step = (tp: TypeParse): TypeParse =>
    isPunct(tp.cursor, "[") && isPunct(advance(tp.cursor), "]")
      ? step({
          cursor: advance(advance(tp.cursor)),
          spec: { kind: "array", item: tp.spec, optional: false, nullable: false },
        })
      : tp;
  return step(start);
};

// A union `A | B | C`: parse members, then fold. All string literals →
// enum; `null`/`undefined` members set nullable/optional on the remaining
// single type; a mixed non-literal union degrades to string.
const parseType = (c: Cursor): TypeParse => {
  const first = parsePostfix(parsePrimary(c));
  const collect = (
    cursor: Cursor,
    specs: readonly FieldSpec[],
    nullable: boolean,
    optional: boolean,
  ): Readonly<{ cursor: Cursor; specs: readonly FieldSpec[]; nullable: boolean; optional: boolean }> => {
    if (!isPunct(cursor, "|")) return { cursor, specs, nullable, optional };
    const next = peek(advance(cursor));
    if (next?.kind === "ident" && next.value === "null") {
      return collect(advance(advance(cursor)), specs, true, optional);
    }
    if (next?.kind === "ident" && next.value === "undefined") {
      return collect(advance(advance(cursor)), specs, nullable, true);
    }
    const member = parsePostfix(parsePrimary(advance(cursor)));
    return collect(member.cursor, [...specs, member.spec], nullable, optional);
  };
  const { cursor, specs, nullable, optional } = collect(
    first.cursor,
    [first.spec],
    false,
    false,
  );
  return { cursor, spec: foldUnion(specs, nullable, optional) };
};

const foldUnion = (
  specs: readonly FieldSpec[],
  nullable: boolean,
  optional: boolean,
): FieldSpec => {
  if (specs.length === 1) return withFlags(specs[0]!, optional, nullable);
  // All single-option enums (string literals) → one enum of every option.
  const allLiterals = specs.every(
    (s) => s.kind === "enum" && s.options.length === 1,
  );
  if (allLiterals) {
    const options = specs.flatMap((s) => (s.kind === "enum" ? s.options : []));
    return { kind: "enum", options, optional, nullable };
  }
  return withFlags(
    base("string", "unsupported union; defaulted to string"),
    optional,
    nullable,
  );
};

// `{ a: string; b?: number }` — members until the matching `}`.
const parseObjectType = (c: Cursor): TypeParse => {
  const open = advance(c); // past "{"
  const step = (
    cursor: Cursor,
    fields: readonly NamedField[],
  ): Readonly<{ cursor: Cursor; fields: readonly NamedField[] }> => {
    if (isPunct(cursor, "}") || peek(cursor) === undefined) {
      return { cursor: isPunct(cursor, "}") ? advance(cursor) : cursor, fields };
    }
    const nameTok = peek(cursor);
    if (nameTok === undefined || nameTok.kind === "punct") {
      // skip a stray separator
      return step(advance(cursor), fields);
    }
    const afterName = advance(cursor);
    const optional = isPunct(afterName, "?");
    const afterOpt = optional ? advance(afterName) : afterName;
    const afterColon = isPunct(afterOpt, ":") ? advance(afterOpt) : afterOpt;
    const parsed = parseType(afterColon);
    const spec = optional
      ? withFlags(parsed.spec, true, parsed.spec.nullable)
      : parsed.spec;
    // consume a trailing ; or ,
    const afterSep =
      isPunct(parsed.cursor, ";") || isPunct(parsed.cursor, ",")
        ? advance(parsed.cursor)
        : parsed.cursor;
    return step(afterSep, [
      ...fields,
      { name: nameTok.value, label: labelFromName(nameTok.value), spec },
    ]);
  };
  const { cursor, fields } = step(open, []);
  return { cursor, spec: { kind: "object", fields, optional: false, nullable: false } };
};

// Find the FIRST `interface Name {...}` or `type Name = {...}` and parse its
// body into the root object spec.
export const parseTypeScript = (source: string): ParseResult => {
  const tokens = tokenize(source);
  const idx = tokens.findIndex(
    (t, i) =>
      t.kind === "ident" &&
      (t.value === "interface" || t.value === "type") &&
      tokens[i + 1]?.kind === "ident",
  );
  if (idx === -1) {
    return {
      ok: false,
      error:
        "No interface or type alias found. Paste something like: interface Profile { name: string }",
    };
  }
  const formName = `${tokens[idx + 1]!.value}Form`;
  // Locate the opening brace of the body.
  const braceOffset = tokens
    .slice(idx)
    .findIndex((t) => t.kind === "punct" && t.value === "{");
  if (braceOffset === -1) {
    return { ok: false, error: "The interface or type has no object body ({ ... })." };
  }
  const cursor: Cursor = { tokens, i: idx + braceOffset };
  const { spec } = parseObjectType(cursor);
  if (spec.kind !== "object" || spec.fields.length === 0) {
    return { ok: false, error: "The type has no readable fields." };
  }
  return { ok: true, formName, ir: spec };
};
