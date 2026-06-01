import type { z } from "zod";
import type { ErrorMap } from "./types";

export type ValidationResult<TOutput> =
  | Readonly<{ kind: "valid"; data: TOutput }>
  | Readonly<{ kind: "invalid"; errors: ErrorMap }>;

export type FieldValidationResult =
  | Readonly<{ kind: "valid" }>
  | Readonly<{ kind: "invalid"; errors: readonly string[] }>;

const issuePathToFormPath = (path: readonly PropertyKey[]): string =>
  path
    .filter((segment): segment is string | number => typeof segment !== "symbol")
    .join(".");

export const flattenIssues = (
  issues: readonly z.core.$ZodIssue[],
): ErrorMap =>
  issues.reduce<Record<string, readonly string[]>>((acc, issue) => {
    const path = issuePathToFormPath(issue.path);
    const existing = acc[path] ?? [];
    return { ...acc, [path]: [...existing, issue.message] };
  }, {});

export const validateSync = <TSchema extends z.ZodType>(
  schema: TSchema,
  values: z.input<TSchema>,
): ValidationResult<z.output<TSchema>> => {
  const result = schema.safeParse(values);
  return result.success
    ? { kind: "valid", data: result.data }
    : { kind: "invalid", errors: flattenIssues(result.error.issues) };
};

export const validateAsync = async <TSchema extends z.ZodType>(
  schema: TSchema,
  values: z.input<TSchema>,
): Promise<ValidationResult<z.output<TSchema>>> => {
  const result = await schema.safeParseAsync(values);
  return result.success
    ? { kind: "valid", data: result.data }
    : { kind: "invalid", errors: flattenIssues(result.error.issues) };
};
