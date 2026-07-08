import { z } from "zod";
import { type PathSegment, parsePath } from "./path";
import type { ErrorMap } from "./types";

export type SettledValidationResult<TOutput> =
  | Readonly<{ kind: "valid"; data: TOutput }>
  | Readonly<{ kind: "invalid"; errors: ErrorMap }>;

export type ValidationResult<TOutput> =
  | SettledValidationResult<TOutput>
  // Returned by the sync `validate()` when the schema needs async parsing:
  // the async pass has already been started and `promise` resolves with its
  // outcome.
  | Readonly<{
      kind: "pending";
      promise: Promise<SettledValidationResult<TOutput>>;
    }>;

export type SettledFieldValidationResult =
  | Readonly<{ kind: "valid" }>
  | Readonly<{ kind: "invalid"; errors: readonly string[] }>;

export type FieldValidationResult =
  | SettledFieldValidationResult
  | Readonly<{
      kind: "pending";
      promise: Promise<SettledFieldValidationResult>;
    }>;

const issuePathToFormPath = (path: readonly PropertyKey[]): string =>
  path
    .filter((segment): segment is string | number => typeof segment !== "symbol")
    .join(".");

type FlatIssue = Readonly<{ path: string; message: string }>;

// A failing plain `z.union` produces a single `invalid_union` issue whose real
// per-branch issues live in `issue.errors` with paths relative to the union's
// position. Recurse into them (prefixed with the union's own path) so users
// get field-level messages instead of one generic "Invalid input"; keep the
// union's own message only when no branch supplies anything more specific.
const expandIssue = (
  issue: z.core.$ZodIssue,
  prefix: readonly PropertyKey[],
): readonly FlatIssue[] => {
  const at = [...prefix, ...issue.path];
  if (issue.code === "invalid_union") {
    const nested = issue.errors.flatMap((branch) =>
      branch.flatMap((sub) => expandIssue(sub, at)),
    );
    if (nested.length > 0) return nested;
  }
  return [{ path: issuePathToFormPath(at), message: issue.message }];
};

export const flattenIssues = (
  issues: readonly z.core.$ZodIssue[],
): ErrorMap =>
  issues
    .flatMap((issue) => expandIssue(issue, []))
    .reduce<Record<string, readonly string[]>>((acc, { path, message }) => {
      // Union branches often repeat the same complaint; drop exact duplicates.
      const existing = acc[path] ?? [];
      return existing.includes(message)
        ? acc
        : { ...acc, [path]: [...existing, message] };
    }, {});

export const validateSync = <TSchema extends z.ZodType>(
  schema: TSchema,
  values: z.input<TSchema>,
): SettledValidationResult<z.output<TSchema>> => {
  const result = schema.safeParse(values);
  return result.success
    ? { kind: "valid", data: result.data }
    : { kind: "invalid", errors: flattenIssues(result.error.issues) };
};

export const validateAsync = async <TSchema extends z.ZodType>(
  schema: TSchema,
  values: z.input<TSchema>,
): Promise<SettledValidationResult<z.output<TSchema>>> => {
  const result = await schema.safeParseAsync(values);
  return result.success
    ? { kind: "valid", data: result.data }
    : { kind: "invalid", errors: flattenIssues(result.error.issues) };
};

// The message fallback covers the dual-package hazard: with two zod copies
// loaded, the thrown error is not an instance of *this* copy's class.
export const isAsyncRequiredError = (e: unknown): boolean =>
  e instanceof z.core.$ZodAsyncError ||
  (e instanceof Error &&
    /Encountered Promise during synchronous parse/i.test(e.message));

// True when `key` is `path` itself or a descendant ("a.b" under "a"). The
// root "" matches only the "" key — whole-form scope is never implicit;
// call sites that want it (validateField(""), focusFirstError's fallback)
// handle the root explicitly instead of inheriting a wildcard.
export const isPathOrChild = (key: string, path: string): boolean =>
  key === path || key.startsWith(`${path}.`);

// Re-key an error map produced by parsing a field's subschema so its keys are
// absolute form paths ("" becomes the field path itself).
export const prefixErrorKeys = (errors: ErrorMap, path: string): ErrorMap =>
  path === ""
    ? errors
    : Object.fromEntries(
        Object.entries(errors).map(([k, v]) => [
          k === "" ? path : `${path}.${k}`,
          v,
        ]),
      );

// The empty representation a field's schema accepts: undefined when the
// field is optional (or the wrappers are unrecognized — undefined is the
// library-wide default empty), null when it is nullable but not optional.
// Lets a cleared input round-trip to a valid blank based on what the schema
// states rather than guessing from runtime values.
export const emptyValueForSchema = (schema: z.ZodType): null | undefined => {
  const walk = (s: z.ZodType, sawNullable: boolean): null | undefined => {
    if (s instanceof z.ZodOptional) return undefined;
    if (s instanceof z.ZodNullable) {
      return walk(s.unwrap() as z.ZodType, true);
    }
    return sawNullable ? null : undefined;
  };
  return walk(schema, false);
};

// One unwrap step for the lax structural walk below: wrappers that are
// transparent to a path (optional/nullable/default/readonly/catch/pipe/...)
// yield their inner schema; anything else returns null and is judged as-is.
const unwrapForWalk = (s: z.ZodType): z.ZodType | null => {
  if (s instanceof z.ZodOptional || s instanceof z.ZodNullable) {
    return s.unwrap() as z.ZodType;
  }
  if (
    s instanceof z.ZodDefault ||
    s instanceof z.ZodPrefault ||
    s instanceof z.ZodCatch ||
    s instanceof z.ZodReadonly ||
    s instanceof z.ZodNonOptional
  ) {
    return s.def.innerType as z.ZodType;
  }
  // Form values are z.input, so a pipe is traversed through its input side.
  if (s instanceof z.ZodPipe) return s.def.in as z.ZodType;
  return null;
};

// Leaves that provably have no children: remaining path segments under one of
// these cannot exist in the schema.
const isLeafSchema = (s: z.ZodType): boolean =>
  s instanceof z.ZodString ||
  s instanceof z.ZodNumber ||
  s instanceof z.ZodBoolean ||
  s instanceof z.ZodBigInt ||
  s instanceof z.ZodDate ||
  s instanceof z.ZodEnum ||
  s instanceof z.ZodLiteral ||
  s instanceof z.ZodNull ||
  s instanceof z.ZodUndefined ||
  s instanceof z.ZodVoid ||
  s instanceof z.ZodNaN ||
  s instanceof z.ZodSymbol;

// Every unwrap and every consumed segment costs one step — generous for any
// real path, but it bounds pathological wrapper towers.
const SCHEMA_WALK_BUDGET = 64;

// Lax structural check: can `path` possibly exist under `schema`? Used to
// warn when validateField targets a path the schema cannot contain (which
// would otherwise silently validate as always-valid). Deliberately biased
// toward "yes": objects answer from their shape (a catchall/loose object
// accepts any key), arrays accept any numeric index into their element, and
// everything too dynamic to judge — records, maps, tuples, unions,
// intersections, lazies, any/unknown, unrecognized nodes — answers true so
// the warning can never be a false positive. Only a provable miss (a key
// absent from a closed object shape, a string segment into an array, or
// segments remaining under a scalar leaf) answers false.
export const schemaHasPath = (schema: z.ZodType, path: string): boolean => {
  const walk = (
    s: z.ZodType,
    segments: readonly PathSegment[],
    budget: number,
  ): boolean => {
    if (budget <= 0) return true;
    const inner = unwrapForWalk(s);
    if (inner !== null) return walk(inner, segments, budget - 1);
    const [head, ...rest] = segments;
    if (head === undefined) return true;
    if (s instanceof z.ZodObject) {
      const shape: Readonly<Record<string, z.ZodType | undefined>> = s.shape;
      const child = shape[String(head)];
      if (child !== undefined) return walk(child, rest, budget - 1);
      // A loose/catchall object accepts keys beyond the shape (a ZodNever
      // catchall — strictObject — rejects them like a closed shape does).
      const catchall = s.def.catchall;
      return catchall !== undefined && !(catchall instanceof z.ZodNever);
    }
    if (s instanceof z.ZodArray) {
      return typeof head === "number"
        ? walk(s.element as z.ZodType, rest, budget - 1)
        : false;
    }
    return !isLeafSchema(s);
  };
  return walk(schema, parsePath(path), SCHEMA_WALK_BUDGET);
};

const hasChecks = (s: z.ZodType): boolean => {
  const checks = (s.def as Readonly<{ checks?: readonly unknown[] }>).checks;
  return checks !== undefined && checks.length > 0;
};

// Walk the schema along a dot path so field-level validation can parse just
// that field instead of the whole form. Returns null (meaning: fall back to a
// full-form parse) unless every *traversed* level is a plain ZodObject or
// ZodArray with no checks — a refinement on a traversed level could target
// this field's path, so extraction would miss or fail to clear its errors.
// Wrappers (optional/nullable/default/pipe/union/record/...) also bail: their
// error keying differs from a direct parse of the inner value. The leaf itself
// may carry any checks — they belong to the field.
export const fieldSchemaAtPath = (
  schema: z.ZodType,
  path: string,
): z.ZodType | null =>
  parsePath(path).reduce<z.ZodType | null>((current, segment: PathSegment) => {
    if (current === null || hasChecks(current)) return null;
    if (current instanceof z.ZodObject && typeof segment === "string") {
      const shape: Readonly<Record<string, z.ZodType | undefined>> =
        current.shape;
      return shape[segment] ?? null;
    }
    if (current instanceof z.ZodArray && typeof segment === "number") {
      return current.element as z.ZodType;
    }
    return null;
  }, schema);
