import {
  type FieldSpec,
  type NamedField,
  type StringFormat,
} from "./ir";
import { isScalarSpec } from "./depth";
import { propKey } from "./codegen";

// The generated-tests case IR (see cli/design/generated-tests.md): one
// walk of the FieldSpec IR produces a plan every runner emits from. v1
// derives only what the IR actually carries — the walkers capture kinds,
// optionality, formats, enum options, and defaults, but NOT zod check
// metadata (min/max/length) or authored messages — so the plan holds:
//
// - requiredPaths: fields a BLANK form fails on. That is narrower than
//   "not optional": a bare z.string() accepts the seeded "", and a
//   required boolean accepts the seeded false, so only numbers, dates,
//   and enums (seeded undefined) plus formatted strings ("" is not an
//   email) start invalid. Bound-constraint cases (min/max/arrayMin) wait
//   on IR enrichment, honestly, rather than guessing.
// - formatChecks: the three string formats, each with a rejecting and a
//   passing sample.
// - validValues: a nested literal the whole schema parses, for the
//   submit-valid round trip (asserted against schema.parse of the same
//   literal, so transforms and defaults need no prediction).
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

export type GeneratedTestPlan = Readonly<{
  requiredPaths: readonly RequiredCase[];
  formatChecks: readonly FormatCase[];
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

// Does a blank form fail at this scalar? (See the header: strings pass ""
// unless formatted, booleans pass false, defaults fill themselves.)
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
      return spec.format !== undefined;
    default:
      // Containers are walked, not judged here; booleans pass false.
      return false;
  }
};

// A VALID literal for one spec — the inverse of emitInitialValues' blank.
const validLiteral = (spec: FieldSpec, level: number): string => {
  const ind = "  ".repeat(level);
  const child = "  ".repeat(level + 1);
  switch (spec.kind) {
    case "string":
      return spec.format === undefined
        ? `"filled"`
        : `"${FORMAT_SAMPLES[spec.format].good}"`;
    case "number":
      return "1";
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
    case "array":
      // Empty stays the safe valid guess without min metadata in the IR.
      return "[]";
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
  formats: readonly FormatCase[];
  fills: readonly LabelFill[];
}>;

const EMPTY: WalkAcc = { required: [], formats: [], fills: [] };

const merge = (a: WalkAcc, b: WalkAcc): WalkAcc => ({
  required: [...a.required, ...b.required],
  formats: [...a.formats, ...b.formats],
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
    if (!isScalarSpec(field.spec)) return acc;
    const required: readonly RequiredCase[] = blankInvalid(field.spec)
      ? [{ path, label: field.label }]
      : [];
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
        ? [
            {
              label: field.label,
              text:
                field.spec.format === undefined
                  ? "filled"
                  : FORMAT_SAMPLES[field.spec.format].good,
            },
          ]
        : field.spec.kind === "number"
          ? [{ label: field.label, text: "1" }]
          : [];
    return merge(acc, { required, formats, fills });
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
    formatChecks: walked.formats,
    validValues: emitValidValues(ir),
    labelFills: fills,
    firstInvalidLabel: firstInvalid?.label,
  };
};
