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

// THE predicate for "does this field currently show an error" — shared by
// the aria-invalid mapping here and the field shells in fields.tsx, so the
// notion of "showing an error" cannot drift between bindings.
export const hasFieldError = (
  error: readonly string[] | undefined,
): boolean => error !== undefined && error.length > 0;

const ariaInvalid = (
  field: Readonly<{ error: readonly string[] | undefined }>,
): true | undefined => (hasFieldError(field.error) ? true : undefined);

// A cleared input writes back `field.emptyValue` when the schema ACCEPTS it
// (`field.clearable`: optional, nullable, or defaulted — useField introspects
// the form's zod schema), so z.number().nullable() round-trips to null and
// z.string().optional() to undefined instead of a lingering "". A required
// string cleared to "" stays "": writing undefined there would trade a
// visible value the schema can judge for a hole it rejects.

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
  // "1e") or Infinity. A trailing point ("1.") is a number (1): the
  // text input keeps the point, the form already holds the value.
  | Readonly<{ kind: "invalid" }>;

// Plain decimal notation: an optional sign, digits with an optional
// fraction (a bare ".5" included, and a trailing "1." reads as 1: the
// number is live while a text input keeps the point on screen), an
// optional exponent. Number() alone also reads hex, octal and binary
// literals ("0x10" stored 16) and the Infinity spellings, none of which a
// person means in a number field.
const DECIMAL_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

// The single rule for turning user-typed text into a numeric field value:
// whitespace counts as empty (Number("  ") is 0), only decimal notation
// parses, and non-finite results are rejected. Shared with NumberField.
export const parseNumberText = (text: string): ParsedNumberText => {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };
  if (!DECIMAL_TEXT.test(trimmed)) return { kind: "invalid" };
  const parsed = Number(trimmed);
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
    // Deleting all text from a clearable field restores its emptyValue
    // (null or undefined), so it isn't left permanently dirty (or invalid)
    // by a visual no-op.
    field.setValue((text === "" && field.clearable ? field.emptyValue : text) as T);
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
    // "invalid" is a PARTIAL entry (a lone "-", "1e") — keep the stored
    // value untouched, matching useNumberInput's deliberate semantics,
    // instead of writing emptyValue mid-keystroke (which flashed a
    // required error and flipped dirty while the user was still typing).
    // "empty" still clears to emptyValue. Note browsers report "" for
    // badInput on type="number", so some partial entries arrive as
    // "empty" regardless — useNumberInput (a text input with its own raw
    // state) remains the binding that preserves every keystroke.
    if (parsed.kind === "invalid") return;
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
//
// A value that is not a Date at runtime is read as one for display: a
// persisted draft hands a Date field back as the ISO string JSON made of
// it (persistForm documents that it does not revive Dates), and the
// `.getTime()` on that string threw at render, on every visit, since the
// crashing draft was the one being rewritten. The schema still rejects the
// string at validation, which is the honest state to leave it in.
export const dateToInputText = (value: Date | null | undefined): string => {
  if (value === undefined || value === null) return "";
  // A date-only string (a persisted draft's "2026-03-01") is read as the
  // calendar date it spells: the Date constructor parses that form as UTC
  // midnight, which rendered the previous day west of UTC.
  if (typeof value === "string") {
    // Out of the declared type (the parameter says Date), hence the cast.
    const text = value as unknown as string;
    const parsed = parseDateText(text);
    if (parsed.kind === "date") return dateToInputText(parsed.value);
    // A date-shaped string the parser rejects (a rolled-over "2026-02-31")
    // must not fall through to the Date constructor's UTC reading either;
    // it spells no day, so it renders as empty.
    if (/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) return "";
  }
  const date =
    value instanceof Date ? value : new Date(value as unknown as string);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
    field.setValue((v === "" && field.clearable ? field.emptyValue : v) as T);
  },
  onBlur: field.onBlur,
});
