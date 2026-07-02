import type { ChangeEvent } from "react";
import type { UseFieldReturn } from "./useField";

export type TextInputProps = Readonly<{
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
}>;

export type NumberInputProps = Readonly<{
  type: "number";
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}>;

export type CheckboxProps = Readonly<{
  type: "checkbox";
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}>;

export type SelectProps = Readonly<{
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  onBlur: () => void;
}>;

export const textInputProps = <T extends string | undefined>(
  field: UseFieldReturn<T>,
): TextInputProps => ({
  value: field.value ?? "",
  onChange: (e) => field.setValue(e.target.value as T),
  onBlur: field.onBlur,
});

export const numberInputProps = <T extends number | undefined>(
  field: UseFieldReturn<T>,
): NumberInputProps => ({
  type: "number",
  value:
    field.value === undefined || Number.isNaN(field.value)
      ? ""
      : String(field.value),
  onChange: (e) => {
    const raw = e.target.value;
    if (raw === "") {
      field.setValue(undefined as T);
      return;
    }
    const parsed = Number(raw);
    field.setValue((Number.isNaN(parsed) ? undefined : parsed) as T);
  },
  onBlur: field.onBlur,
});

export const checkboxProps = <T extends boolean | undefined>(
  field: UseFieldReturn<T>,
): CheckboxProps => ({
  type: "checkbox",
  checked: field.value ?? false,
  onChange: (e) => field.setValue(e.target.checked as T),
  onBlur: field.onBlur,
});

// `?? ""` keeps the <select> controlled when the field has no value yet;
// pair it with an <option value=""> (SelectField renders one) so the blank
// state is a real option instead of silently showing the first entry.
export const selectProps = <T extends string | undefined>(
  field: UseFieldReturn<T>,
): SelectProps => ({
  value: field.value ?? "",
  onChange: (e) => field.setValue(e.target.value as T),
  onBlur: field.onBlur,
});
