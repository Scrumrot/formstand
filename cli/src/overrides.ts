import { pascalCase } from "./casing";
import { isScalarSpec, overDepthBudget } from "./depth";
import type { FieldSpec, NamedField } from "./ir";

// Per-field component overrides — the formstand.config.ts `fields` block:
//
//   export default defineConfig({
//     fields: {
//       "icao": { component: "autocomplete", optionsProp: true },
//       "crew.*.role": { component: "autocomplete", optionsProp: true },
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
// as new members without reshaping the config.
export type FieldOverrideConfig = Readonly<{
  component: "autocomplete";
  // string fields: REQUIRED (the options are data — an airport list — so
  // the generated component must accept them as a prop). enum fields:
  // optional; when true the prop REPLACES the baked-in enum values.
  optionsProp?: boolean;
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
        (key) => key !== "component" && key !== "optionsProp",
      );
      if (unknownKeys.length > 0) {
        throw new Error(
          `${from}: fields["${path}"] has unknown key(s) ${unknownKeys
            .map((key) => `"${key}"`)
            .join(", ")} (known: component, optionsProp)`,
        );
      }
      const component = override["component"];
      if (
        typeof component !== "string" ||
        !(OVERRIDE_COMPONENTS as readonly string[]).includes(component)
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
      return [
        path,
        {
          component: component as FieldOverrideConfig["component"],
          ...(optionsProp === undefined ? {} : { optionsProp }),
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
// paths, in IR order. Unions/tuples are excluded (not overridable).
export const overridablePaths = (root: FieldSpec): readonly string[] => {
  const walk = (
    spec: FieldSpec,
    segments: readonly string[],
  ): readonly string[] => {
    switch (spec.kind) {
      case "object":
        return spec.fields.flatMap((field) =>
          walk(field.spec, [...segments, field.name]),
        );
      case "array":
        return walk(spec.item, [...segments, "*"]);
      case "tuple":
      case "union":
        return [];
      default:
        return segments.length === 0 ? [] : [segments.join(".")];
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
  component: "autocomplete";
  optionsPropName?: string;
}>;

const overrideError = (path: string, why: string): string =>
  `fields["${path}"]: ${why}`;

// Validate every override against the walked IR and return a new IR with the
// matched leaves stamped. Throws ONE error aggregating every problem (the
// CLI's loud-failure style — exit 1, nothing emitted). `layout` matters for
// one reachability rule: the module layout degrades objects nested inside
// array rows to a TODO, so an override buried there errors under
// --layout module instead of silently vanishing.
export const applyFieldOverrides = (
  ir: FieldSpec,
  overrides: FieldOverrides | undefined,
  layout: "single" | "module" = "single",
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
      const problems = [
        ...(!isScalarSpec(spec) || (spec.kind !== "string" && spec.kind !== "enum")
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
        ...(spec.kind === "string" && config.optionsProp !== true
          ? [
              overrideError(
                path,
                `a plain string field has no options source — set optionsProp: true so the generated component accepts "${optionsPropBaseName(
                  match.segments,
                )}: readonly string[]"`,
              ),
            ]
          : []),
        ...(layout === "module" && match.insideRowObject
          ? [
              overrideError(
                path,
                `this field sits inside an object nested in array rows, which --layout module degrades to a TODO; use --layout single or restructure the schema`,
              ),
            ]
          : []),
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
      const wantsProp = match.spec.kind === "string" || config.optionsProp === true;
      if (!wantsProp) {
        return {
          used: acc.used,
          byPath: new Map([
            ...acc.byPath,
            [
              path,
              { segments: match.segments, spec: { component: config.component } },
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
              spec: { component: config.component, optionsPropName: name },
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
