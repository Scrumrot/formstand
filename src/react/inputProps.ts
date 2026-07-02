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

export const textInputProps = <T extends string | undefined>(
  field: UseFieldReturn<T>,
): TextInputProps => ({
  name: field.path,
  value: field.value ?? "",
  "aria-invalid": ariaInvalid(field),
  onChange: (e) => field.setValue(e.target.value as T),
  onBlur: field.onBlur,
});

export const numberInputProps = <T extends number | undefined>(
  field: UseFieldReturn<T>,
): NumberInputProps => ({
  type: "number",
  name: field.path,
  value:
    field.value === undefined || Number.isNaN(field.value)
      ? ""
      : String(field.value),
  "aria-invalid": ariaInvalid(field),
  onChange: (e) => {
    const raw = e.target.value;
    // Whitespace counts as empty (Number("  ") is 0); Infinity is rejected.
    if (raw.trim() === "") {
      field.setValue(undefined as T);
      return;
    }
    const parsed = Number(raw);
    field.setValue((Number.isFinite(parsed) ? parsed : undefined) as T);
  },
  onBlur: field.onBlur,
});

export const checkboxProps = <T extends boolean | undefined>(
  field: UseFieldReturn<T>,
): CheckboxProps => ({
  type: "checkbox",
  name: field.path,
  checked: field.value ?? false,
  "aria-invalid": ariaInvalid(field),
  onChange: (e) => field.setValue(e.target.checked as T),
  onBlur: field.onBlur,
});

// `?? ""` keeps the <select> controlled when the field has no value yet;
// pair it with an <option value=""> (SelectField renders one) so the blank
// state is a real option instead of silently showing the first entry.
export const selectProps = <T extends string | undefined>(
  field: UseFieldReturn<T>,
): SelectProps => ({
  name: field.path,
  value: field.value ?? "",
  "aria-invalid": ariaInvalid(field),
  onChange: (e) => field.setValue(e.target.value as T),
  onBlur: field.onBlur,
});
