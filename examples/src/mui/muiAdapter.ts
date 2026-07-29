import type { ChangeEvent } from "react";
import type { SelectChangeEvent } from "@mui/material";
import { type UseFieldReturn, useNumberInput } from "formstand";
import { firstError, hasError } from "../fieldErrors";

// The formstand → Material UI bridge, the same adapter shape
// `formstand-gen --ui mui` emits. Each builder takes a `useField` result
// and returns a spreadable props object for the matching MUI component —
// like the library's own textInputProps, but speaking MUI's dialect:
// validity as an `error` boolean plus a `helperText` line instead of
// `aria-invalid` (MUI wires the aria attributes itself). Numbers go through
// the library's exported useNumberInput — MUI's TextField is a text input,
// and that hook is the text-preserving binding behind NumberField (partial
// entries like "-" and "1." stay visible while typing). The stateless
// numberInputProps builder remains the right choice for NATIVE
// type="number" inputs, where the browser holds partial entries itself.
// This file is the whole integration; copy the pattern for any other UI
// kit.

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

export type UseMuiNumberFieldPropsReturn = Readonly<{
  name: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onBlur: () => void;
  error: boolean;
  helperText: string | undefined;
  slotProps: Readonly<{ input: Readonly<{ inputMode: "decimal" }> }>;
}>;

// A hook, not a builder: useNumberInput keeps the raw text in local state
// while it doesn't parse, so intermediate entries survive keystrokes. Call
// it at component top (`const props = useMuiNumberFieldProps(field)`) and
// spread onto a TextField — inputMode rides in via slotProps.input since
// the control stays a text input.
export const useMuiNumberFieldProps = <T extends number | null | undefined>(
  field: UseFieldReturn<T>,
): UseMuiNumberFieldPropsReturn => {
  // Widened for useNumberInput (via unknown: setValue's parameter is
  // contravariant, so a required-number field isn't directly convertible):
  // clearing still writes emptyValue — the same runtime the old
  // per-keystroke `as T` cast produced, asserted once here instead.
  const binding = useNumberInput(
    field as unknown as UseFieldReturn<number | null | undefined>,
  );
  return {
    name: binding.name,
    value: binding.value,
    onChange: (event) =>
      binding.onChange(event as ChangeEvent<HTMLInputElement>),
    onBlur: binding.onBlur,
    error: hasError(field),
    helperText: firstError(field),
    slotProps: { input: { inputMode: "decimal" } },
  };
};

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
