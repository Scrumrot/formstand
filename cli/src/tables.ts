import { isScalarSpec, overDepthBudget } from "./depth";
import type { FieldSpec, NamedField } from "./ir";

// Whether an array of objects renders its rows as a TABLE (one column per
// row field, the label in the header, a Row component binding each cell)
// or as CARDS (one bordered block per row, the fields stacked). Tables are
// the default wherever the rows are flat enough for a table to host them;
// cards are the fallback for every other row shape, and
// `fields: { "<path>": { layout: "cards" } }` opts a tabular array back
// out. Both layouts and the override validator decide through these two
// functions, so the emitters and the config errors cannot disagree on
// which arrays are tables.

export type TableLayout = "table" | "cards";

// Why one row field cannot be a table cell, or undefined when it can. A
// cell holds exactly one scalar control bound at `row.${name}`: a nested
// container would need a section inside a cell, an overridden leaf renders
// a control the cell renderers do not speak (the autocomplete and textarea
// overrides keep the card layout), and the usual path rules apply (a "."
// in a key is not path-addressable, the full path must fit the budget).
// The name check restates codegen's isUnaddressable rather than importing
// it, so this module stays a leaf both emitters and the validator can load.
const cellRejection = (
  field: NamedField,
  rowSegments: number,
  budget: number,
): string | undefined =>
  field.name.includes(".")
    ? `has a "." in its name, which is not path-addressable`
    : !isScalarSpec(field.spec)
      ? `is ${
          field.spec.kind === "object"
            ? "an object"
            : field.spec.kind === "array"
              ? "an array"
              : field.spec.kind === "union"
                ? "a discriminated union"
                : "a tuple"
        }; a table cell holds one scalar control`
      : overDepthBudget(field.spec, rowSegments + 1, budget)
        ? `exceeds the typed FieldPath depth (${budget})`
        : field.spec.override?.component !== undefined
          ? `carries a component override ("${field.spec.override.component}"), which table cells do not render`
          : undefined;

// Why an array's rows cannot be tabular, worded for the override error
// (the config asked for a table the generator cannot build), or undefined
// when a table can host them. `rowSegments` is the segment count of the
// ROW path (`list.${index}`), so each field's full bound path is judged
// against the typed-path budget exactly as the emitters judge it.
export const tableRejection = (
  item: FieldSpec,
  rowSegments: number,
  budget: number,
): string | undefined => {
  if (item.kind !== "object") {
    return `its rows are not objects (kind "${item.kind}"); a table needs one column per row field`;
  }
  if (item.fields.length === 0) {
    return "its row object has no fields, so there are no columns";
  }
  const rejected = item.fields
    .map((field) => ({
      field,
      why: cellRejection(field, rowSegments, budget),
    }))
    .find(({ why }) => why !== undefined);
  return rejected === undefined
    ? undefined
    : `row field "${rejected.field.name}" ${rejected.why ?? ""}`;
};

// The columns of a tabular array, in row-field order, or undefined when
// the array renders as cards: either the rows cannot be tabular (see
// tableRejection) or the config opted the array out (`layout` is the
// array spec's own override, "cards" wins over everything). Each column is
// the row field itself (name, label, spec); the Row component binds
// `row.${name}` and the header shows the label.
export const tableColumns = (
  item: FieldSpec,
  rowSegments: number,
  budget: number,
  layout?: TableLayout | undefined,
): readonly NamedField[] | undefined =>
  layout === "cards" ||
  item.kind !== "object" ||
  tableRejection(item, rowSegments, budget) !== undefined
    ? undefined
    : item.fields;
