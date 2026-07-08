import type { ChangeEvent } from "react";
import {
  type UseFieldReturn,
  numberToInputText,
  parseNumberText,
} from "formstand";

// The formstand → shadcn/ui bridge. Same shape as the MUI adapter: each
// builder takes a `useField` result and returns a spreadable props object
// for the matching component. Two dialects meet here — the Input/Textarea
// components take native DOM events, while the Radix-based widgets
// (Checkbox, Switch, Select, Slider, RadioGroup) take value-first callbacks
// (`onCheckedChange`, `onValueChange`) and signal "done editing" through
// close/commit events rather than blur. Errors surface as `aria-invalid`
// (the components style themselves off it); render the message with
// <FieldError field={...} />.

type ErrorSlice = Readonly<{ error: readonly string[] | undefined }>;

const hasError = (field: ErrorSlice): boolean =>
  field.error !== undefined && field.error.length > 0;

// aria-invalid only when true — `aria-invalid="false"` is noise for
// screen readers and would make every pristine control style-relevant.
const ariaInvalid = (field: ErrorSlice): true | undefined =>
  hasError(field) ? true : undefined;

export type ShadcnInputProps = Readonly<{
  name: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onBlur: () => void;
  "aria-invalid": true | undefined;
}>;

export const shadcnInputProps = <T extends string | null | undefined>(
  field: UseFieldReturn<T>,
): ShadcnInputProps => ({
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
  "aria-invalid": ariaInvalid(field),
});

export type ShadcnNumberInputProps = Readonly<{
  type: "number";
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  "aria-invalid": true | undefined;
}>;

export const shadcnNumberInputProps = <T extends number | null | undefined>(
  field: UseFieldReturn<T>,
): ShadcnNumberInputProps => ({
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
  "aria-invalid": ariaInvalid(field),
});

export type ShadcnCheckboxProps = Readonly<{
  name: string;
  checked: boolean;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
  onBlur: () => void;
  "aria-invalid": true | undefined;
}>;

export const shadcnCheckboxProps = <T extends boolean | null | undefined>(
  field: UseFieldReturn<T>,
): ShadcnCheckboxProps => ({
  name: field.path,
  checked: field.value ?? false,
  // Radix reports "indeterminate" only for tri-state checkboxes; a boolean
  // field never sets that state, so it reads as unchecked.
  onCheckedChange: (checked) => field.setValue((checked === true) as T),
  onBlur: field.onBlur,
  "aria-invalid": ariaInvalid(field),
});

export type ShadcnSwitchProps = Readonly<{
  name: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onBlur: () => void;
}>;

export const shadcnSwitchProps = <T extends boolean | null | undefined>(
  field: UseFieldReturn<T>,
): ShadcnSwitchProps => ({
  name: field.path,
  checked: field.value ?? false,
  onCheckedChange: (checked) => field.setValue(checked as T),
  onBlur: field.onBlur,
});

// Spread onto <Select> (the Radix Root); pair with your own SelectTrigger.
// Radix has no blur event on the root — closing the dropdown is the "done
// editing" signal, so it maps to the field's blur trigger and onBlur-mode
// forms validate when the menu closes.
export type ShadcnSelectProps = Readonly<{
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}>;

export const shadcnSelectProps = <T extends string | null | undefined>(
  field: UseFieldReturn<T>,
): ShadcnSelectProps => ({
  name: field.path,
  // Radix shows the placeholder for "" — and never reports "" back through
  // onValueChange (items can't carry an empty value), so the round-trip is
  // safe for fields that start empty.
  value: field.value ?? "",
  onValueChange: (value) => field.setValue(value as T),
  onOpenChange: (open) => {
    if (!open) field.onBlur();
  },
});

export type ShadcnRadioGroupProps = Readonly<{
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  "aria-invalid": true | undefined;
}>;

export const shadcnRadioGroupProps = <T extends string | null | undefined>(
  field: UseFieldReturn<T>,
): ShadcnRadioGroupProps => ({
  name: field.path,
  value: field.value ?? "",
  onValueChange: (value) => field.setValue(value as T),
  "aria-invalid": ariaInvalid(field),
});

// Radix sliders speak number[] (multi-thumb); a single-number field binds
// to a one-element array. onValueChange fires continuously while dragging,
// so validation waits for onValueCommit (mapped to the blur trigger) —
// onBlur-mode forms don't validate sixty times a second mid-drag.
export type ShadcnSliderProps = Readonly<{
  name: string;
  // Mutable tuple on purpose: Radix types `value` as number[], and a
  // readonly array wouldn't be assignable to it.
  value: [number];
  onValueChange: (value: readonly number[]) => void;
  onValueCommit: () => void;
}>;

export const shadcnSliderProps = <T extends number>(
  field: UseFieldReturn<T>,
): ShadcnSliderProps => ({
  name: field.path,
  value: [field.value],
  onValueChange: (value) => field.setValue((value[0] ?? field.value) as T),
  onValueCommit: () => field.onBlur(),
});
