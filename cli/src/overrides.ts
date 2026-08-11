import { pascalCase } from "./casing";
import { isUnaddressable } from "./codegen";
import { isScalarSpec, overDepthBudget } from "./depth";
import type { FieldSpec, NamedField } from "./ir";

// Per-field overrides — the formstand.config.ts `fields` block:
//
//   export default defineConfig({
//     fields: {
//       "icao": { component: "autocomplete", optionsProp: true },
//       "crew.*.role": { component: "autocomplete", optionsProp: true },
//       "employment.salary": { span: "full" },
//       "address.street": { span: 2 },
//     },
//   });
//
// Paths are exact dot paths against the walked schema, with `*` matching one
// array-index segment (an array's rows). Config problems are ERRORS (exit 1),
// never warnings: a typo'd path, an override on a non-string/enum field, a
// plain string without an options source, a degraded/over-budget target —
// each fails loudly, naming the path and why (with near-miss suggestions for
// unknown paths). applyFieldOverrides validates the whole block, then stamps
// the matched leaves' specs (see FieldOverrideSpec in ./ir); everything
// downstream is the ordinary pure-string-builder pipeline.

// The config-file shape of one override (before resolution). `component` is
// a union of one on purpose — future flavors (textarea, slider, ...) slot in
// as new members without reshaping the config. `span` is the second,
// independent axis: layout placement in the section's multi-column grid.
// An entry must carry at least one of the two.
export type FieldOverrideConfig = Readonly<{
  component?: "autocomplete";
  // string fields: REQUIRED (the options are data — an airport list — so
  // the generated component must accept them as a prop). enum fields:
  // optional; when true the prop REPLACES the baked-in enum values.
  optionsProp?: boolean;
  // "full" spans the whole row; a number is how many columns the field
  // occupies (2 of 3, say). 1 would be the default item width, so the
  // parser rejects it as noise rather than silently accepting a no-op.
  span?: number | "full";
}>;

export type FieldOverrides = Readonly<Record<string, FieldOverrideConfig>>;

const OVERRIDE_COMPONENTS = ["autocomplete"] as const;

// Shape-validate the config block the same way the CLI validates its other
// config keys: loudly, at load time, before any schema is walked.
export const parseFieldOverrides = (
  raw: unknown,
  from: string,
): FieldOverrides => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      `${from}: fields must be an object mapping field paths to overrides`,
    );
  }
  const record = raw as Readonly<Record<string, unknown>>;
  const entries = Object.entries(record).map(
    ([path, value]): readonly [string, FieldOverrideConfig] => {
      if (typeof value !== "object" || value === null) {
        throw new Error(
          `${from}: fields["${path}"] must be an object like { component: "autocomplete" }`,
        );
      }
      const override = value as Readonly<Record<string, unknown>>;
      const unknownKeys = Object.keys(override).filter(
        (key) => key !== "component" && key !== "optionsProp" && key !== "span",
      );
      if (unknownKeys.length > 0) {
        throw new Error(
          `${from}: fields["${path}"] has unknown key(s) ${unknownKeys
            .map((key) => `"${key}"`)
            .join(", ")} (known: component, optionsProp, span)`,
        );
      }
      const component = override["component"];
      if (
        component !== undefined &&
        (typeof component !== "string" ||
          !(OVERRIDE_COMPONENTS as readonly string[]).includes(component))
      ) {
        throw new Error(
          `${from}: fields["${path}"].component must be one of ${OVERRIDE_COMPONENTS.map(
            (name) => `"${name}"`,
          ).join(", ")}`,
        );
      }
      const optionsProp = override["optionsProp"];
      if (optionsProp !== undefined && typeof optionsProp !== "boolean") {
        throw new Error(
          `${from}: fields["${path}"].optionsProp must be a boolean`,
        );
      }
      if (optionsProp !== undefined && component === undefined) {
        throw new Error(
          `${from}: fields["${path}"].optionsProp requires a component override to feed`,
        );
      }
      const span = override["span"];
      // span: 1 is the default item width — accepting it would bless a
      // silent no-op, the exact failure mode this config errors against.
      if (
        span !== undefined &&
        span !== "full" &&
        (typeof span !== "number" || !Number.isInteger(span) || span < 2)
      ) {
        throw new Error(
          `${from}: fields["${path}"].span must be "full" or an integer >= 2`,
        );
      }
      if (component === undefined && span === undefined) {
        throw new Error(
          `${from}: fields["${path}"] must set component and/or span`,
        );
      }
      return [
        path,
        {
          ...(component === undefined
            ? {}
            : { component: component as "autocomplete" }),
          ...(optionsProp === undefined ? {} : { optionsProp }),
          // The exact union, not FieldOverrideConfig["span"]: indexing an
          // optional property re-adds undefined, which the
          // exactOptionalPropertyTypes root build rejects.
          ...(span === undefined ? {} : { span: span as number | "full" }),
        },
      ];
    },
  );
  return Object.fromEntries(entries);
};

// ---------------------------------------------------------------------------
// Path matching against the walked IR
// ---------------------------------------------------------------------------

// Where a matched leaf sits relative to array rows — the module layout
// degrades OBJECTS nested inside array rows to a TODO (its extraction stops
// at one object level per row), so an override buried there is unreachable
// under --layout module and must error rather than vanish.
type MatchResult =
  | Readonly<{
      kind: "found";
      spec: FieldSpec;
      segments: readonly string[];
      // Anywhere under an array's "*" — rows are per-row stacks in every
      // backend, so a span there has no grid to act on.
      insideRow: boolean;
      insideRowObject: boolean;
    }>
  | Readonly<{ kind: "miss"; reason: string }>;

const matchPath = (
  root: FieldSpec,
  segments: readonly string[],
): MatchResult => {
  const walk = (
    spec: FieldSpec,
    rest: readonly string[],
    inRow: boolean,
    inRowObject: boolean,
  ): MatchResult => {
    const [head, ...tail] = rest;
    if (head === undefined) {
      return {
        kind: "found",
        spec,
        segments,
        insideRow: inRow,
        insideRowObject: inRowObject,
      };
    }
    switch (spec.kind) {
      case "object": {
        const field = spec.fields.find((f: NamedField) => f.name === head);
        if (field === undefined) {
          return { kind: "miss", reason: `no field "${head}" here` };
        }
        // Descending INTO an object field while inside an array row marks
        // the subtree as row-object territory (module-layout frontier).
        const childIsRowObject =
          inRowObject || (inRow && field.spec.kind === "object");
        return walk(field.spec, tail, inRow, childIsRowObject);
      }
      case "array":
        if (head !== "*") {
          return {
            kind: "miss",
            reason: `"${head}" names an array row — use "*" for the row index`,
          };
        }
        return walk(spec.item, tail, true, inRowObject);
      case "tuple":
        return {
          kind: "miss",
          reason: "overrides inside tuples are not supported",
        };
      case "union":
        return {
          kind: "miss",
          reason:
            "overrides inside discriminated unions are not supported",
        };
      default:
        return { kind: "miss", reason: `"${head}" descends past a leaf` };
    }
  };
  return walk(root, segments, false, false);
};

// Every path an override COULD name: scalar leaves reachable through objects
// and arrays ("*" marking rows) — the near-miss candidate list for unknown
// paths, in IR order. Unions/tuples are excluded (not overridable), and so
// is every leaf applyFieldOverrides itself would reject: dot-containing
// names (not addressable — the emitters skip the binding), walker-degraded
// leaves, and paths past the FieldPath depth budget. A suggestion the
// validator then errors on would be worse than no suggestion.
export const overridablePaths = (root: FieldSpec): readonly string[] => {
  const walk = (
    spec: FieldSpec,
    segments: readonly string[],
  ): readonly string[] => {
    switch (spec.kind) {
      case "object":
        return spec.fields
          .filter((field) => !isUnaddressable(field.name))
          .flatMap((field) => walk(field.spec, [...segments, field.name]));
      case "array":
        return walk(spec.item, [...segments, "*"]);
      case "tuple":
      case "union":
        return [];
      default:
        return segments.length === 0 ||
          spec.todo !== undefined ||
          overDepthBudget(spec, segments.length)
          ? []
          : [segments.join(".")];
    }
  };
  return walk(root, []);
};

// Plain Levenshtein over whole path strings — cheap at config scale (a
// handful of overrides × a few dozen candidate paths).
const editDistance = (a: string, b: string): number => {
  const row0 = Array.from({ length: b.length + 1 }, (_, i) => i);
  const final = [...a].reduce((prev, charA, i) => {
    const next = [i + 1];
    [...b].forEach((charB, j) => {
      const insert = (next[j] ?? 0) + 1;
      const remove = (prev[j + 1] ?? 0) + 1;
      const swap = (prev[j] ?? 0) + (charA === charB ? 0 : 1);
      next.push(Math.min(insert, remove, swap));
    });
    return next;
  }, row0);
  return final[b.length] ?? 0;
};

const nearMisses = (
  target: string,
  candidates: readonly string[],
): readonly string[] =>
  candidates
    .map((candidate) => ({ candidate, d: editDistance(target, candidate) }))
    .filter(({ d }) => d <= Math.max(3, Math.floor(target.length / 2)))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ candidate }) => candidate);

// ---------------------------------------------------------------------------
// Options-prop naming
// ---------------------------------------------------------------------------

// "crew.*.role" -> "crewRoleOptions": drop the "*" row segments, camel-join
// what remains, append "Options". The suffix keeps the name out of the way
// of the component's fixed identifiers (form, onValuesChange, initialValues,
// ...); distinct paths that normalize to the same name ("crew_role" vs
// "crew.role") disambiguate with 2, 3, ... like every other derived
// identifier in the CLI.
export const optionsPropBaseName = (segments: readonly string[]): string => {
  const pascal = segments
    .filter((segment) => segment !== "*")
    .map(pascalCase)
    .join("");
  const camel =
    pascal.length === 0
      ? pascal
      : pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return `${camel.length === 0 ? "field" : camel}Options`;
};

const suffixFor = (base: string, used: ReadonlySet<string>): string => {
  const next = (n: number): string =>
    used.has(`${base}${n}`) ? next(n + 1) : `${n}`;
  return used.has(base) ? next(2) : "";
};

// ---------------------------------------------------------------------------
// Application: validate the whole block, then stamp the IR
// ---------------------------------------------------------------------------

type ResolvedOverride = Readonly<{
  segments: readonly string[];
  spec: FieldOverrideSpecInput;
}>;

type FieldOverrideSpecInput = Readonly<{
  component?: "autocomplete";
  optionsPropName?: string;
  span?: number | "full";
}>;

const overrideError = (path: string, why: string): string =>
  `fields["${path}"]: ${why}`;

// Validate every override against the walked IR and return a new IR with the
// matched leaves stamped. Throws ONE error aggregating every problem (the
// CLI's loud-failure style — exit 1, nothing emitted). `layout` matters for
// two reachability rules: the module layout degrades objects nested inside
// array rows to a TODO (an autocomplete buried there is unreachable), and
// it stacks deeper-than-section objects as plain fieldsets (a span buried
// there has no grid). `columns` gates span the same way: a span on a
// 1-column form would be a silent no-op, which this config errors against.
export const applyFieldOverrides = (
  ir: FieldSpec,
  overrides: FieldOverrides | undefined,
  layout: "single" | "module" = "single",
  columns = 1,
): FieldSpec => {
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    return ir;
  }
  const candidates = overridablePaths(ir);
  const validated = Object.entries(overrides).map(
    ([path, config]): Readonly<{
      path: string;
      config: FieldOverrideConfig;
      match: MatchResult;
      errors: readonly string[];
    }> => {
      const segments = path.split(".").filter((s) => s.length > 0);
      const match =
        segments.length === 0
          ? ({ kind: "miss", reason: "empty path" } as const)
          : matchPath(ir, segments);
      if (match.kind === "miss") {
        const near = nearMisses(path, candidates);
        return {
          path,
          config,
          match,
          errors: [
            overrideError(
              path,
              `does not match any field in the schema (${match.reason})${
                near.length > 0 ? `; did you mean ${near.map((n) => `"${n}"`).join(", ")}?` : ""
              }`,
            ),
          ],
        };
      }
      const { spec } = match;
      const wantsComponent = config.component !== undefined;
      const problems = [
        ...(wantsComponent &&
        (!isScalarSpec(spec) || (spec.kind !== "string" && spec.kind !== "enum"))
          ? [
              overrideError(
                path,
                `component "autocomplete" applies to string and enum fields only, but this field is kind "${spec.kind}"${
                  spec.kind === "array" &&
                  (spec.item.kind === "string" || spec.item.kind === "enum")
                    ? ` (to override the rows, use "${path}.*")`
                    : ""
                }`,
              ),
            ]
          : []),
        ...(spec.todo !== undefined
          ? [
              overrideError(
                path,
                `this field was degraded by the walker (${spec.todo}); fix the schema or raise --max-depth before overriding it`,
              ),
            ]
          : []),
        ...(overDepthBudget(spec, match.segments.length)
          ? [
              overrideError(
                path,
                `this path exceeds formstand's typed FieldPath depth — the emitters degrade it to a TODO, so an override cannot apply`,
              ),
            ]
          : []),
        ...(wantsComponent && spec.kind === "string" && config.optionsProp !== true
          ? [
              overrideError(
                path,
                `a plain string field has no options source — set optionsProp: true so the generated component accepts "${optionsPropBaseName(
                  match.segments,
                )}: readonly string[]"`,
              ),
            ]
          : []),
        ...(wantsComponent && layout === "module" && match.insideRowObject
          ? [
              overrideError(
                path,
                `this field sits inside an object nested in array rows, which --layout module degrades to a TODO; use --layout single or restructure the schema`,
              ),
            ]
          : []),
        // A span that cannot reach a grid is a silent no-op, so every
        // placement without one errors: the value names a LAYOUT intent,
        // and layouts that stack (roots, rows, 1-column forms, module
        // fieldsets below the section) cannot honor it.
        ...(config.span === undefined
          ? []
          : [
              ...(!isScalarSpec(spec)
                ? [
                    overrideError(
                      path,
                      `span applies to scalar fields; containers (kind "${spec.kind}") already span the full row`,
                    ),
                  ]
                : []),
              ...(columns < 2
                ? [
                    overrideError(
                      path,
                      `span needs a multi-column form — pass --columns 2 or 3`,
                    ),
                  ]
                : []),
              ...(match.segments.length < 2
                ? [
                    overrideError(
                      path,
                      `root-level fields stack vertically in every layout; span applies to fields inside sections`,
                    ),
                  ]
                : []),
              ...(match.insideRow
                ? [
                    overrideError(
                      path,
                      `array rows stack vertically; a span has no grid to act on inside "*" rows`,
                    ),
                  ]
                : []),
              ...(layout === "module" &&
              !match.insideRow &&
              match.segments.length > 2
                ? [
                    overrideError(
                      path,
                      `--layout module stacks objects below the top-level section as plain fieldsets; only a section's direct fields sit in its grid (use --layout single for deeper spans)`,
                    ),
                  ]
                : []),
            ]),
      ];
      return { path, config, match, errors: problems };
    },
  );

  const errors = validated.flatMap((entry) => entry.errors);
  if (errors.length > 0) {
    throw new Error(
      errors.length === 1
        ? errors[0] ?? ""
        : `${errors.length} field-override problems:\n${errors
            .map((e) => `  - ${e}`)
            .join("\n")}`,
    );
  }

  // Resolve options-prop names in config order, disambiguating collisions
  // with the CLI's usual 2, 3, ... suffixes.
  const resolved = validated.reduce<
    Readonly<{
      used: ReadonlySet<string>;
      byPath: ReadonlyMap<string, ResolvedOverride>;
    }>
  >(
    (acc, { path, config, match }) => {
      if (match.kind !== "found") return acc; // unreachable after the throw
      const spanPart = config.span === undefined ? {} : { span: config.span };
      const componentPart =
        config.component === undefined ? {} : { component: config.component };
      // Only a component override feeds from an options prop; a span-only
      // entry on a string field must NOT claim one.
      const wantsProp =
        config.component !== undefined &&
        (match.spec.kind === "string" || config.optionsProp === true);
      if (!wantsProp) {
        return {
          used: acc.used,
          byPath: new Map([
            ...acc.byPath,
            [
              path,
              {
                segments: match.segments,
                spec: { ...componentPart, ...spanPart },
              },
            ],
          ]),
        };
      }
      const base = optionsPropBaseName(match.segments);
      const name = `${base}${suffixFor(base, acc.used)}`;
      return {
        used: new Set([...acc.used, name]),
        byPath: new Map([
          ...acc.byPath,
          [
            path,
            {
              segments: match.segments,
              spec: { ...componentPart, optionsPropName: name, ...spanPart },
            },
          ],
        ]),
      };
    },
    { used: new Set<string>(), byPath: new Map() },
  ).byPath;

  // Stamp the IR: rebuild immutably, attaching each override at its matched
  // leaf. Keyed by joined segments so the walk below finds them in place.
  const bySegments = new Map(
    [...resolved.values()].map((entry) => [
      entry.segments.join("."),
      entry.spec,
    ]),
  );
  const stamp = (
    spec: FieldSpec,
    segments: readonly string[],
  ): FieldSpec => {
    const here = bySegments.get(segments.join("."));
    const withOverride =
      here === undefined ? spec : { ...spec, override: here };
    switch (withOverride.kind) {
      case "object":
        return {
          ...withOverride,
          fields: withOverride.fields.map((field) => ({
            ...field,
            spec: stamp(field.spec, [...segments, field.name]),
          })),
        };
      case "array":
        return {
          ...withOverride,
          item: stamp(withOverride.item, [...segments, "*"]),
        };
      default:
        return withOverride;
    }
  };
  return stamp(ir, []);
};
