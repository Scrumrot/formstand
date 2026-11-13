import { useMemo, useState } from "react";
import type { z } from "zod";
import type { Form } from "../core/createForm";
import type {
  DefaultPathDepth,
  FieldPath,
  FieldValue,
  PathDepth,
} from "../core/fieldPath";
import {
  type FieldFormApi,
  type UseFieldOptions,
  type UseFieldReturn,
  useField,
} from "./useField";

// Composite fields: ONE control backed by SEVERAL schema paths — a
// coordinate pair behind a single map-driven input, a range's min/max, a
// date span. Binding each path with its own useField works, but the
// coordination (a combined error line, one blur, one touched/dirty answer)
// is the same hand-written boilerplate every time. useFields binds the
// paths together:
//
//   const location = useFields(form, ["latitude", "longitude"]);
//   const [latitude, longitude] = location.fields;   // full UseFieldReturns
//   <span>{location.firstError}</span>               // combined error line
//
// Each element of `fields` is a REAL UseFieldReturn — it spreads into the
// same prop builders and Bound components a solo binding would — and the
// wrapper adds the combined view: errors merged in path order (deduped, so
// a cross-field superRefine that stamps both paths reads once), touched /
// dirty / isValidating as "any of them", and one onBlur that blurs every
// path (each under the form's own validation mode gate).
//
// THE PATHS TUPLE IS PART OF THE HOOK CONTRACT: its length and order must
// be stable across renders, because it expands to exactly that many hook
// calls. The hook enforces it at the very render that broke the contract
// (pinned by the test suite), with its own message ahead of React's
// "Rendered fewer/more hooks" error, so pass a literal or a module-level
// constant, never a filtered array.

export type UseFieldsReturn<TFields extends readonly unknown[]> = Readonly<{
  fields: TFields;
  // Every bound path's messages, merged in path order and deduped.
  error: readonly string[] | undefined;
  firstError: string | undefined;
  // "Any of them": one answer for the composite control's chrome.
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
  // Blurs every bound path — each under the form's validation mode gate,
  // so the composite behaves like one control losing focus.
  onBlur: () => void;
}>;

// Schema-less forms keep the caller-typed shape (the `schema?: undefined`
// brand forces a real Form past this overload, mirroring useField).
export function useFields(
  form: FieldFormApi & { readonly schema?: undefined },
  paths: readonly string[],
  options?: UseFieldOptions,
): UseFieldsReturn<readonly UseFieldReturn<unknown>[]>;
// The typed overload: `paths` is a const-inferred tuple and `fields` maps
// it position-for-position, so destructuring keeps each path's exact value
// type. D is recovered from the form (the "~pathDepth" marker), like the
// sibling hooks.
export function useFields<
  TSchema extends z.ZodType,
  const P extends readonly FieldPath<z.input<TSchema>, D>[],
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  paths: P,
  // One options bag for every bound path (a composite control debounces
  // as one control).
  options?: UseFieldOptions,
): UseFieldsReturn<{
  readonly [K in keyof P]: UseFieldReturn<
    FieldValue<z.input<TSchema>, P[K] & string>
  >;
}>;
export function useFields(
  form: FieldFormApi,
  paths: readonly string[],
  options?: UseFieldOptions,
): UseFieldsReturn<readonly UseFieldReturn<unknown>[]> {
  // The arity the hook was first called with, held in a hook slot that
  // sits BEFORE the per-path calls: a tuple that changes length is caught
  // here with a message that names the hook, before the shifted hook
  // slots below would surface as React's generic hooks-count error (or,
  // with the memo below, as a crash inside React's dependency compare).
  const [arity] = useState(paths.length);
  if (paths.length !== arity) {
    throw new Error(
      `[formstand] useFields: the paths tuple changed length (${String(arity)} to ${String(paths.length)}); its length and order must be stable across renders, so pass a literal or a module-level constant.`,
    );
  }
  const fields = paths.map((path) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed hook count by the stable-arity contract above; each element must be a REAL UseFieldReturn so it spreads into the prop builders
    useField(
      form as FieldFormApi & { readonly schema?: undefined },
      path,
      options,
    ),
  );
  // Memoized on the bound fields themselves (each a memoized
  // UseFieldReturn), so the composite keeps its identity, its `fields`
  // array and its onBlur across renders that change none of them, the
  // way useField and useFieldArray do; a fresh object per render made
  // every memoized consumer of the composite re-render on every store
  // write. The tuple is a fixed-length dependency list by the arity
  // check above, which is what the literal-array lint rule exists to
  // guarantee.
  return useMemo(() => {
    const merged = [
      ...new Set(fields.flatMap((field) => field.error ?? [])),
    ];
    return {
      fields,
      error: merged.length > 0 ? merged : undefined,
      firstError: merged[0],
      touched: fields.some((field) => field.touched),
      dirty: fields.some((field) => field.dirty),
      isValidating: fields.some((field) => field.isValidating),
      onBlur: () => {
        fields.forEach((field) => {
          field.onBlur();
        });
      },
    };
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps -- the stable-arity tuple IS the dependency list (see the arity check above)
  }, fields);
}
