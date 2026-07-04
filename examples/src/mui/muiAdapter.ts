import type { ChangeEvent } from "react";
import type { SelectChangeEvent } from "@mui/material";
import {
  type UseFieldReturn,
  numberToInputText,
  parseNumberText,
} from "formstand";

// The formstand → Material UI bridge. Each builder takes a `useField` result
// and returns a spreadable props object for the matching MUI component —
// the same shape as the library's own textInputProps/numberInputProps, but
// speaking MUI's dialect: validity as an `error` boolean plus a `helperText`
// line instead of `aria-invalid` (MUI wires the aria attributes itself).
// This ~60-line file is the whole integration; copy the pattern for any
// other UI kit.

type ErrorSlice = Readonly<{ error: readonly string[] | undefined }>;

const hasError = (field: ErrorSlice): boolean =>
  field.error !== undefined && field.error.length > 0;

const firstError = (field: ErrorSlice): string | undefined => field.error?.[0];

export type MuiTextFieldProps = Readonly<{
  name: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onBlur: () => void;
  error: boolean;
  helperText: string | undefined;
}>;

export const muiTextFieldProps = <T extends string | null | undefined>(
  field: UseFieldReturn<T>,
): MuiTextFieldProps => ({
  name: field.path,
  value: field.value ?? "",
  onChange: (event) => {
    const text = event.target.value;
    // Clearing a nullable field writes null back (mirrors textInputProps),
    // so z.string().nullable() round-trips instead of getting stuck at "".
    field.setValue(
      (text === "" && field.emptyValue === null ? null : text) as T,
    );
  },
  onBlur: field.onBlur,
  error: hasError(field),
  helperText: firstError(field),
});

export type MuiNumberFieldProps = Readonly<{
  type: "number";
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  error: boolean;
  helperText: string | undefined;
}>;

export const muiNumberFieldProps = <T extends number | null | undefined>(
  field: UseFieldReturn<T>,
): MuiNumberFieldProps => ({
  type: "number",
  name: field.path,
  value: numberToInputText(field.value),
  onChange: (event) => {
    const parsed = parseNumberText(event.target.value);
    field.setValue(
      (parsed.kind === "number" ? parsed.value : field.emptyValue) as T,
    );
  },
  onBlur: field.onBlur,
  error: hasError(field),
  helperText: firstError(field),
});

// Spread onto <Select>; pair with a FormControl + FormHelperText for the
// error message (Select has no helperText of its own).
export type MuiSelectProps = Readonly<{
  name: string;
  value: string;
  onChange: (event: SelectChangeEvent<string>) => void;
  onBlur: () => void;
  error: boolean;
}>;

export const muiSelectProps = <T extends string | null | undefined>(
  field: UseFieldReturn<T>,
): MuiSelectProps => ({
  name: field.path,
  value: field.value ?? "",
  onChange: (event) => {
    const next = event.target.value;
    field.setValue(
      (next === "" && field.emptyValue === null ? null : next) as T,
    );
  },
  onBlur: field.onBlur,
  error: hasError(field),
});

export type MuiSwitchProps = Readonly<{
  name: string;
  checked: boolean;
  onChange: (
    event: ChangeEvent<HTMLInputElement>,
    checked: boolean,
  ) => void;
  onBlur: () => void;
}>;

export const muiSwitchProps = <T extends boolean | null | undefined>(
  field: UseFieldReturn<T>,
): MuiSwitchProps => ({
  name: field.path,
  checked: field.value ?? false,
  onChange: (_event, checked) => field.setValue(checked as T),
  onBlur: field.onBlur,
});

// Sliders fire onChange continuously while dragging; validation waits for
// onChangeCommitted (mapped to the field's blur trigger) so onBlur-mode
// forms don't validate sixty times a second mid-drag.
export type MuiSliderProps = Readonly<{
  name: string;
  value: number;
  onChange: (event: Event, value: number) => void;
  onChangeCommitted: () => void;
}>;

export const muiSliderProps = <T extends number>(
  field: UseFieldReturn<T>,
): MuiSliderProps => ({
  name: field.path,
  value: field.value,
  onChange: (_event, value) => field.setValue(value as T),
  onChangeCommitted: () => field.onBlur(),
});
