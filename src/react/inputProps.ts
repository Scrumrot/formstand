import type { ChangeEvent } from "react";
import type { UseFieldReturn } from "./useField";

export type TextInputProps = Readonly<{
  name: string;
  value: string;
  "aria-invalid": true | undefined;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
}>;

export type NumberInputProps = Readonly<{
  type: "number";
  name: string;
  value: string;
  "aria-invalid": true | undefined;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}>;

export type DateInputProps = Readonly<{
  type: "date";
  name: string;
  value: string;
  "aria-invalid": true | undefined;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}>;

export type CheckboxProps = Readonly<{
  type: "checkbox";
  name: string;
  checked: boolean;
  "aria-invalid": true | undefined;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}>;

export type SelectProps = Readonly<{
  name: string;
  value: string;
  "aria-invalid": true | undefined;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  onBlur: () => void;
}>;

const ariaInvalid = (field: Readonly<{ error: readonly string[] | undefined }>): true | undefined =>
  field.error !== undefined && field.error.length > 0 ? true : undefined;

// A cleared input writes back `field.emptyValue` — null when the schema says
// the field is nullable (useField introspects the form's zod schema), so
// z.number().nullable() round-trips to a valid blank instead of an undefined
// the schema rejects.

// Canonical display text for a numeric field value ("" for empty/NaN; null
// counts as empty so nullable fields don't render the literal text "null").
// Shared with NumberField so the two number bindings can't drift.
export const numberToInputText = (value: number | null | undefined): string =>
  value === undefined || value === null || Number.isNaN(value)
    ? ""
    : String(value);

export type ParsedNumberText =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "number"; value: number }>
  // Text that doesn't parse to a finite number — partial entries ("-",
  // "1.", "1e") or Infinity.
  | Readonly<{ kind: "invalid" }>;

// The single rule for turning user-typed text into a numeric field value:
// whitespace counts as empty (Number("  ") is 0) and non-finite results are
// rejected. Shared with NumberField.
export const parseNumberText = (text: string): ParsedNumberText => {
  if (text.trim() === "") return { kind: "empty" };
  const parsed = Number(text);
  return Number.isFinite(parsed)
    ? { kind: "number", value: parsed }
    : { kind: "invalid" };
};

export const textInputProps = <T extends string | null | undefined>(
  field: UseFieldReturn<T>,
): TextInputProps => ({
  name: field.path,
  value: field.value ?? "",
  "aria-invalid": ariaInvalid(field),
  onChange: (e) => {
    const text = e.target.value;
    // Deleting all text from a nullable field restores null, so it isn't
    // left permanently dirty (or invalid) by a visual no-op.
    field.setValue(
      (text === "" && field.emptyValue === null ? null : text) as T,
    );
  },
  onBlur: field.onBlur,
});

export const numberInputProps = <T extends number | null | undefined>(
  field: UseFieldReturn<T>,
): NumberInputProps => ({
  type: "number",
  name: field.path,
  value: numberToInputText(field.value),
  "aria-invalid": ariaInvalid(field),
  onChange: (e) => {
    const parsed = parseNumberText(e.target.value);
    field.setValue(
      (parsed.kind === "number" ? parsed.value : field.emptyValue) as T,
    );
  },
  onBlur: field.onBlur,
});

// Canonical display text for a Date field value — the local calendar date
// as "yyyy-MM-dd" (what <input type="date"> speaks). Local parts, NOT
// toISOString(): a date picked as June 1 must not render as May 31 for
// users west of UTC. Invalid Dates count as empty. Shared with DateField.
export const dateToInputText = (value: Date | null | undefined): string => {
  if (value === undefined || value === null || Number.isNaN(value.getTime())) {
    return "";
  }
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${String(value.getFullYear()).padStart(4, "0")}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

export type ParsedDateText =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "date"; value: Date }>
  // Not "yyyy-MM-dd", or parts that roll over (2026-02-31).
  | Readonly<{ kind: "invalid" }>;

// The single rule for turning "yyyy-MM-dd" into a Date field value: LOCAL
// midnight — a calendar date, not a UTC instant (new Date("2026-06-01")
// would be UTC midnight and read back as May 31 west of Greenwich).
// Shared with DateField.
export const parseDateText = (text: string): ParsedDateText => {
  if (text.trim() === "") return { kind: "empty" };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return { kind: "invalid" };
  const [, year, month, day] = match;
  const y = Number(year);
  const date = new Date(y, Number(month) - 1, Number(day));
  // The Date constructor maps two-digit years 0–99 to 1900–1999, so a valid
  // "0099-01-01" would fail the survival check below; force the literal year
  // back on for years under 100 before checking rollover.
  if (y < 100) date.setFullYear(y);
  // The parts must survive the Date constructor — rollovers are invalid,
  // not silently the 3rd of next month.
  return date.getFullYear() === y &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
    ? { kind: "date", value: date }
    : { kind: "invalid" };
};

export const dateInputProps = <T extends Date | null | undefined>(
  field: UseFieldReturn<T>,
): DateInputProps => ({
  type: "date",
  name: field.path,
  value: dateToInputText(field.value),
  "aria-invalid": ariaInvalid(field),
  onChange: (e) => {
    const parsed = parseDateText(e.target.value);
    if (parsed.kind !== "date") {
      field.setValue(field.emptyValue as T);
      return;
    }
    // Preserve the existing value's time-of-day: <input type="date"> only
    // edits the calendar date, so re-picking the SAME day on a value that
    // carried a time (an initial `new Date()`) must stay a no-op — otherwise
    // the new local-midnight Date differs from the timestamped original and
    // the field reads spuriously dirty. Changing the day keeps that time.
    const current = field.value;
    const next =
      current instanceof Date && !Number.isNaN(current.getTime())
        ? new Date(
            parsed.value.getFullYear(),
            parsed.value.getMonth(),
            parsed.value.getDate(),
            current.getHours(),
            current.getMinutes(),
            current.getSeconds(),
            current.getMilliseconds(),
          )
        : parsed.value;
    field.setValue(next as T);
  },
  onBlur: field.onBlur,
});

export const checkboxProps = <T extends boolean | null | undefined>(
  field: UseFieldReturn<T>,
): CheckboxProps => ({
  type: "checkbox",
  name: field.path,
  checked: field.value ?? false,
  "aria-invalid": ariaInvalid(field),
  onChange: (e) => field.setValue(e.target.checked as T),
  onBlur: field.onBlur,
});

// `?? ""` keeps the <select> controlled when the field has no value yet
// (undefined for optional fields, null for nullable ones); pair it with an
// <option value=""> (SelectField renders one) so the blank state is a real
// option instead of silently showing the first entry.
export const selectProps = <T extends string | null | undefined>(
  field: UseFieldReturn<T>,
): SelectProps => ({
  name: field.path,
  value: field.value ?? "",
  "aria-invalid": ariaInvalid(field),
  onChange: (e) => {
    const v = e.target.value;
    field.setValue(
      (v === "" && field.emptyValue === null ? null : v) as T,
    );
  },
  onBlur: field.onBlur,
});
