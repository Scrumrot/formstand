import type { FieldSpec } from "./ir";

// The FieldPath depth budget, shared by the emitters (codegen/moduleLayout)
// and the schema walkers (fromZod/fromType derive their default nesting
// budget from it) — a tiny leaf module so both sides import it without a
// cycle.

// formstand's typed path union stops at 9 SEGMENTS by default:
// src/core/fieldPath.ts declares `FieldPath<T, D extends number = 9>`,
// spending one D per dot-separated segment. A binding whose full path has
// more segments falls outside the union and fails typecheck (TS2820), so
// the emitters degrade it to a TODO comment instead — exactly like other
// unsupported shapes. Generated forms don't set createForm's `pathDepth`
// option, so the library default is the budget here; a future --path-depth
// flag would pair with it.
export const FORMSTAND_PATH_DEPTH = 9;

// The scalar (leaf-control) kinds — everything that binds one control at its
// own path, as opposed to the containers (object/array/union/tuple) that
// render sections, rows, or variant blocks.
export const isScalarSpec = (spec: FieldSpec): boolean =>
  spec.kind !== "object" &&
  spec.kind !== "array" &&
  spec.kind !== "union" &&
  spec.kind !== "tuple";

// THE boundary predicate: whether a node whose path has `segments` segments
// falls outside the FieldPath budget. A scalar or an array binds its OWN
// path, so it may sit exactly AT the budget (over only past it); an
// object/union/tuple binds one segment past its path (child fields / the
// discriminant / positional indices), so it needs headroom BELOW the budget.
// Every depth comparison in the emitters routes through here, so the two
// layouts and the CLI warnings cannot drift on the boundary.
export const overDepthBudget = (spec: FieldSpec, segments: number): boolean =>
  isScalarSpec(spec) || spec.kind === "array"
    ? segments > FORMSTAND_PATH_DEPTH
    : segments >= FORMSTAND_PATH_DEPTH;

// The EXACT todo text both walkers (fromZod/fromType) stamp on a node the
// nesting budget truncated — a recognizable marker, not just prose, so the
// CLI can collect truncated paths (codegen's truncatedFieldPaths) and mirror
// them as stderr warnings. Truncation degrades the node to a string-kind
// stand-in BEFORE wrappers unwrap, so the spec's kind (and flags) may be
// wrong — which is also why blankNeedsCast forces the initialValues cast for
// a required todo-bearing leaf (truncated specs are always required-flagged).
export const NESTING_LIMIT_TODO =
  "nesting depth limit reached; defaulted to string";
