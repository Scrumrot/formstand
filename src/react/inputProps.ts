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
  onChange: (e) => field.setValue(e.target.value as T),
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
    field.setValue((parsed.kind === "number" ? parsed.value : undefined) as T);
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
  onChange: (e) => field.setValue(e.target.value as T),
  onBlur: field.onBlur,
});
