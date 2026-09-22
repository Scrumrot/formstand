import {
  type FieldSpec,
  type NamedField,
  type StringFormat,
} from "./ir";
import { isScalarSpec } from "./depth";
import { propKey } from "./codegen";

// The generated-tests case IR (see cli/design/generated-tests.md): one
// walk of the FieldSpec IR produces a plan every runner emits from. The
// plan derives only what the IR actually carries — kinds, optionality,
// formats, enum options, defaults, and (since the check-metadata
// enrichment) string/number/array bounds, but NOT authored messages — so
// it holds:
//
// - requiredPaths: fields a BLANK form fails on. That is narrower than
//   "not optional": a bare z.string() accepts the seeded "", and a
//   required boolean accepts the seeded false, so only numbers, dates,
//   and enums (seeded undefined), formatted strings ("" is not an email),
//   strings with a minimum length, and arrays with a minimum length (the
//   blank form holds no rows) start invalid.
// - formatChecks: the three string formats, each with a rejecting and a
//   passing sample.
// - boundChecks: one rejecting and one passing sample per bounded string
//   or number (a value just past the tightest edge, and one inside it).
// - validValues: a nested literal the whole schema parses, for the
//   submit-valid round trip (asserted against schema.parse of the same
//   literal, so transforms and defaults need no prediction). Bounds shape
//   the literal: strings repeat to the minimum length, numbers sit at the
//   lower edge, arrays carry the minimum row count.
// - label plans for the render and browser layers: fills go BY LABEL,
//   which is what the generated markup associates for a11y — so the spec
//   asserts what users see, and a hand-renamed label breaks it loudly.
//
// Walk boundaries: subtrees under arrays, tuples-with-container-elements,
// and unions contribute no cases (a blank form holds no rows, and union
// variant requiredness depends on the seeded discriminant); depth-TODO
// and unaddressable fields are skipped like every other emitter.

export type RequiredCase = Readonly<{ path: string; label: string }>;

export type FormatCase = Readonly<{
  path: string;
  label: string;
  format: StringFormat;
  bad: string;
  good: string;
}>;

export type LabelFill = Readonly<{
  label: string;
  // What to type into the control (always a string — these drive DOM
  // change events).
  text: string;
}>;

// One bound probe per bounded string/number: `bad` sits just past the
// tightest edge (the minimum first, then the maximum, then integrality),
// `good` is the field's valid sample. Both are SOURCE literals — a number
// case fills the store with a number, a string case with a string — and
// `reason` names the edge for the case title ("shorter than 3 characters").
export type BoundCase = Readonly<{
  path: string;
  label: string;
  reason: string;
  bad: string;
  good: string;
}>;

export type GeneratedTestPlan = Readonly<{
  requiredPaths: readonly RequiredCase[];
  // Arrays whose minimum row count a blank form ([]) cannot meet. Kept
  // apart from requiredPaths because no single labeled control carries
  // the array-level error, so they never qualify as firstInvalidLabel.
  arrayMinPaths: readonly RequiredCase[];
  formatChecks: readonly FormatCase[];
  boundChecks: readonly BoundCase[];
  // Source text of the valid-values literal (nested object).
  validValues: string;
  // Text-shaped, label-reachable fills for the render/browser layers
  // (labels deduped: a repeated label is dropped rather than guessed at).
  labelFills: readonly LabelFill[];
  // The first blank-invalid control reachable by a unique label — the
  // render/browser "blank submit flags it" case; undefined skips it.
  firstInvalidLabel: string | undefined;
}>;

const FORMAT_SAMPLES: Readonly<
  Record<StringFormat, Readonly<{ bad: string; good: string }>>
> = {
  email: { bad: "not-an-email", good: "tim@example.com" },
  url: { bad: "not-a-url", good: "https://example.com/" },
  uuid: {
    bad: "not-a-uuid",
    good: "3f2f9b0e-8c1d-4c62-9f7a-1b2c3d4e5f60",
  },
};

type StringSpec = Extract<FieldSpec, { kind: "string" }>;
type NumberSpec = Extract<FieldSpec, { kind: "number" }>;

// The plain-string sample: "filled" when nothing bounds it, otherwise
// "filled" stretched or cut to sit inside [minLength, maxLength]. A
// formatted string keeps its format sample regardless — a bound on an
// email is almost always satisfied by the sample, and no padding rule
// keeps an address valid.
const BASE_TEXT = "filled";

const stringSample = (spec: StringSpec): string => {
  if (spec.format !== undefined) return FORMAT_SAMPLES[spec.format].good;
  const min = spec.checks?.minLength ?? 0;
  const max = spec.checks?.maxLength ?? Number.POSITIVE_INFINITY;
  const length = Math.min(Math.max(BASE_TEXT.length, min), max);
  return length <= BASE_TEXT.length
    ? BASE_TEXT.slice(0, length)
    : BASE_TEXT + "x".repeat(length - BASE_TEXT.length);
};

// The number sample: 1 when unbounded, else the smallest legal value at
// the lower edge, pulled back to the largest legal value at the upper
// edge when the two collide. "Legal" folds integrality in: an exclusive
// edge on an integer steps to the next whole number (`.int().gt(0.5)` is
// 1, not 1.5), and a non-integer walks one unit past an exclusive edge so
// the sample stays a readable literal.
const numberSample = (spec: NumberSpec): number => {
  const checks = spec.checks;
  if (checks === undefined) return 1;
  const int = checks.int === true;
  const lowest =
    checks.min === undefined
      ? 1
      : checks.minExclusive === true
        ? int
          ? Math.floor(checks.min) + 1
          : checks.min + 1
        : int
          ? Math.ceil(checks.min)
          : checks.min;
  const highest =
    checks.max === undefined
      ? Number.POSITIVE_INFINITY
      : checks.maxExclusive === true
        ? int
          ? Math.ceil(checks.max) - 1
          : checks.max - 1
        : int
          ? Math.floor(checks.max)
          : checks.max;
  return Math.min(lowest, highest);
};

// The rejecting sample for a bounded field, or null when the field carries
// no bound a sample can cross (a minLength of 0, say). Order: minimum,
// maximum, integrality — one probe per field keeps the spec readable.
const boundProbe = (
  spec: StringSpec | NumberSpec,
): Readonly<{ reason: string; bad: string }> | null => {
  if (spec.kind === "string") {
    if (spec.format !== undefined || spec.checks === undefined) return null;
    const { minLength, maxLength } = spec.checks;
    return minLength !== undefined && minLength > 0
      ? {
          reason: `shorter than ${minLength} character${minLength === 1 ? "" : "s"}`,
          bad: JSON.stringify("x".repeat(minLength - 1)),
        }
      : maxLength !== undefined
        ? {
            reason: `longer than ${maxLength} character${maxLength === 1 ? "" : "s"}`,
            bad: JSON.stringify("x".repeat(maxLength + 1)),
          }
        : null;
  }
  const checks = spec.checks;
  if (checks === undefined) return null;
  return checks.min !== undefined
    ? checks.minExclusive === true
      ? { reason: `at or below ${checks.min}`, bad: String(checks.min) }
      : { reason: `below ${checks.min}`, bad: String(checks.min - 1) }
    : checks.max !== undefined
      ? checks.maxExclusive === true
        ? { reason: `at or above ${checks.max}`, bad: String(checks.max) }
        : { reason: `above ${checks.max}`, bad: String(checks.max + 1) }
      : checks.int === true
        ? { reason: "that is not an integer", bad: "1.5" }
        : null;
};

// Does a blank form fail at this scalar? (See the header: strings pass ""
// unless formatted or length-bounded, booleans pass false, defaults fill
// themselves.)
const blankInvalid = (spec: FieldSpec): boolean => {
  if (spec.optional || spec.nullable || spec.defaultValue !== undefined) {
    return false;
  }
  switch (spec.kind) {
    case "number":
    case "date":
    case "enum":
      return true;
    case "string":
      return spec.format !== undefined || (spec.checks?.minLength ?? 0) > 0;
    default:
      // Containers are walked, not judged here; booleans pass false.
      return false;
  }
};

// An array seeds [] whatever its wrappers say (emitInitialValues never
// materializes rows, and a captured default array is not seeded), so a
// minimum row count fails the blank form even on an optional array: []
// is defined, and zod checks it.
const blankArrayInvalid = (spec: FieldSpec): boolean =>
  spec.kind === "array" && (spec.checks?.minLength ?? 0) > 0;

// A VALID literal for one spec — the inverse of emitInitialValues' blank.
const validLiteral = (spec: FieldSpec, level: number): string => {
  const ind = "  ".repeat(level);
  const child = "  ".repeat(level + 1);
  switch (spec.kind) {
    case "string":
      return JSON.stringify(stringSample(spec));
    case "number":
      return String(numberSample(spec));
    case "boolean":
      return "true";
    case "date":
      return `new Date("2026-01-02T00:00:00.000Z")`;
    case "enum":
      return `"${spec.options[0] ?? ""}"`;
    case "object":
      return spec.fields.length === 0
        ? "{}"
        : [
            "{",
            ...spec.fields.map(
              (field) =>
                `${child}${propKey(field.name)}: ${validLiteral(field.spec, level + 1)},`,
            ),
            `${ind}}`,
          ].join("\n");
    case "array": {
      // Empty is the safe valid guess unless a minimum demands rows; the
      // rows are the item's own valid literal, so a bounded row satisfies
      // its own bounds too.
      const rows = spec.checks?.minLength ?? 0;
      return rows === 0
        ? "[]"
        : `[${Array.from({ length: rows }, () => validLiteral(spec.item, level)).join(", ")}]`;
    }
    case "tuple":
      return `[${spec.elements.map((element) => validLiteral(element, level)).join(", ")}]`;
    case "union": {
      const first = spec.variants[0];
      if (first === undefined) return "{}";
      return [
        "{",
        `${child}${propKey(spec.discriminant)}: "${first.tag}",`,
        ...first.fields.map(
          (field) =>
            `${child}${propKey(field.name)}: ${validLiteral(field.spec, level + 1)},`,
        ),
        `${ind}}`,
      ].join("\n");
    }
  }
};

export const emitValidValues = (ir: FieldSpec): string => validLiteral(ir, 0);

type WalkAcc = Readonly<{
  required: readonly RequiredCase[];
  arrayMin: readonly RequiredCase[];
  formats: readonly FormatCase[];
  bounds: readonly BoundCase[];
  fills: readonly LabelFill[];
}>;

const EMPTY: WalkAcc = {
  required: [],
  arrayMin: [],
  formats: [],
  bounds: [],
  fills: [],
};

const merge = (a: WalkAcc, b: WalkAcc): WalkAcc => ({
  required: [...a.required, ...b.required],
  arrayMin: [...a.arrayMin, ...b.arrayMin],
  formats: [...a.formats, ...b.formats],
  bounds: [...a.bounds, ...b.bounds],
  fills: [...a.fills, ...b.fills],
});

const walkFields = (
  fields: readonly NamedField[],
  prefix: string,
): WalkAcc =>
  fields.reduce((acc, field) => {
    if (field.name.includes(".") || field.spec.todo !== undefined) return acc;
    const path = prefix === "" ? field.name : `${prefix}.${field.name}`;
    if (field.spec.kind === "object") {
      return merge(acc, walkFields(field.spec.fields, path));
    }
    // The array itself is judged (its row minimum), its rows are not: the
    // blank form holds none.
    if (blankArrayInvalid(field.spec)) {
      return merge(acc, { ...EMPTY, arrayMin: [{ path, label: field.label }] });
    }
    if (!isScalarSpec(field.spec)) return acc;
    const required: readonly RequiredCase[] = blankInvalid(field.spec)
      ? [{ path, label: field.label }]
      : [];
    const probe =
      field.spec.kind === "string" || field.spec.kind === "number"
        ? boundProbe(field.spec)
        : null;
    const bounds: readonly BoundCase[] =
      probe === null
        ? []
        : [
            {
              path,
              label: field.label,
              ...probe,
              good: validLiteral(field.spec, 0),
            },
          ];
    const formats: readonly FormatCase[] =
      field.spec.kind === "string" && field.spec.format !== undefined
        ? [
            {
              path,
              label: field.label,
              format: field.spec.format,
              ...FORMAT_SAMPLES[field.spec.format],
            },
          ]
        : [];
    // Label fills drive DOM change events, so only text-shaped controls
    // qualify (numbers type as text into the kit-agnostic inputs; enums
    // render selects and dates render pickers — store-level cases cover
    // those).
    const fills: readonly LabelFill[] =
      field.spec.kind === "string"
        ? [{ label: field.label, text: stringSample(field.spec) }]
        : field.spec.kind === "number"
          ? [{ label: field.label, text: String(numberSample(field.spec)) }]
          : [];
    return merge(acc, { ...EMPTY, required, formats, bounds, fills });
  }, EMPTY);

const dedupeByLabel = (fills: readonly LabelFill[]): readonly LabelFill[] => {
  const counts = fills.reduce<ReadonlyMap<string, number>>(
    (map, fill) =>
      new Map([...map, [fill.label, (map.get(fill.label) ?? 0) + 1]]),
    new Map(),
  );
  return fills.filter((fill) => counts.get(fill.label) === 1);
};

export const collectTestPlan = (ir: FieldSpec): GeneratedTestPlan => {
  const walked = ir.kind === "object" ? walkFields(ir.fields, "") : EMPTY;
  const fills = dedupeByLabel(walked.fills);
  // The render/browser blank-submit case queries by label, so the chosen
  // control's label must be unambiguous among the blank-invalid set.
  const requiredLabelCounts = walked.required.reduce<
    ReadonlyMap<string, number>
  >(
    (map, entry) =>
      new Map([...map, [entry.label, (map.get(entry.label) ?? 0) + 1]]),
    new Map(),
  );
  const firstInvalid = walked.required.find(
    (entry) => requiredLabelCounts.get(entry.label) === 1,
  );
  return {
    requiredPaths: walked.required,
    arrayMinPaths: walked.arrayMin,
    formatChecks: walked.formats,
    boundChecks: walked.bounds,
    validValues: emitValidValues(ir),
    labelFills: fills,
    firstInvalidLabel: firstInvalid?.label,
  };
};
