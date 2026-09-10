import type { z } from "zod";
import type { Form } from "../core/createForm";
import type {
  DefaultPathDepth,
  FieldPath,
  FieldValue,
  PathDepth,
} from "../core/fieldPath";
import { type FieldFormApi, type UseFieldReturn, useField } from "./useField";

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
// calls. React enforces this itself — a tuple that changes length throws
// the "Rendered fewer/more hooks than expected" dev error at the very
// render that broke the contract (pinned by the test suite), so pass a
// literal or a module-level constant, never a filtered array.

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
): UseFieldsReturn<{
  readonly [K in keyof P]: UseFieldReturn<
    FieldValue<z.input<TSchema>, P[K] & string>
  >;
}>;
export function useFields(
  form: FieldFormApi,
  paths: readonly string[],
): UseFieldsReturn<readonly UseFieldReturn<unknown>[]> {
  const fields = paths.map((path) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed hook count by the stable-arity contract above; each element must be a REAL UseFieldReturn so it spreads into the prop builders
    useField(form as FieldFormApi & { readonly schema?: undefined }, path),
  );
  const merged = [...new Set(fields.flatMap((field) => field.error ?? []))];
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
}
