import type { UseFieldReturn } from "formstand";
import { type ErrorSlice, ariaInvalid } from "../fieldErrors";

// The formstand → shadcn/ui bridge — the Radix half only. shadcn's Input
// and Textarea take native DOM events, so the library's own exported
// builders bind them with nothing extra:
//
//   <Input {...textInputProps(field)} />
//   <Input {...numberInputProps(field)} />
//
// What needs bridging is the Radix dialect: Checkbox, Switch, Select,
// Slider, and RadioGroup take value-first callbacks (`onCheckedChange`,
// `onValueChange`) and signal "done editing" through close/commit events
// rather than blur. Errors surface as `aria-invalid` (the components style
// themselves off it); render the message with <FieldError field={...} />.

export { ariaInvalid };

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

// Spread onto <Select> (the Radix Root); pair with your own SelectTrigger
// (give the trigger `aria-invalid={ariaInvalid(field)}` for error styling).
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

// Re-exported so demo code can keep a single adapter import even though the
// slice type lives in the shared module.
export type { ErrorSlice };
