import { type ChangeEvent, type ReactNode, useId, useState } from "react";
import type { z } from "zod";
import type { Form } from "../core/createForm";
import type { FieldPath } from "../core/fieldPath";
import {
  checkboxProps,
  dateInputProps,
  numberToInputText,
  parseNumberText,
  selectProps,
  textInputProps,
} from "./inputProps";
import { type FieldFormApi, type UseFieldReturn, useField } from "./useField";

// The paths a bound component accepts for a given `form` prop: when the form
// carries its schema (a real Form<TSchema>), `path` narrows to the schema's
// FieldPath union — a typo'd path is a compile error, matching useField's
// typed overloads. Template-literal paths with a numeric hole
// (`users.${index}.email`) are part of that union, so dynamic array rows
// still typecheck. A bare structural FieldFormApi keeps plain string paths.
export type PathsOf<F extends FieldFormApi> = F extends Form<
  infer TSchema extends z.ZodType
>
  ? FieldPath<z.input<TSchema>>
  : string;

// Structural stand-in for React.Ref<T>: accepts useRef objects and callback
// refs (including React 19 cleanup-returning ones — any return type is
// assignable to a void-returning signature). Declared structurally instead of
// as React.Ref so it unifies even when the consumer resolves a different
// @types/react copy than the library.
export type FieldRef<T> =
  | ((instance: T | null) => void)
  | Readonly<{ current: T | null }>
  | null;

const hasError = (error: readonly string[] | undefined): boolean =>
  error !== undefined && error.length > 0;

// role="alert" announces the message to assistive tech when it appears; the
// id lets the input point at it via aria-describedby.
const ErrorText = ({
  id,
  error,
}: Readonly<{ id: string; error: readonly string[] | undefined }>) =>
  hasError(error) ? (
    <span className="zf-error" id={id} role="alert">
      {error?.[0]}
    </span>
  ) : null;

export type TextFieldProps<F extends FieldFormApi = FieldFormApi> = Readonly<{
  form: F;
  path: PathsOf<F>;
  label?: ReactNode;
  placeholder?: string;
  type?: "text" | "password" | "email" | "url" | "tel";
  autoComplete?: string;
  ref?: FieldRef<HTMLInputElement>;
}>;

export const TextField = <F extends FieldFormApi>({
  form,
  path,
  label,
  placeholder,
  type = "text",
  autoComplete,
  ref,
}: TextFieldProps<F>) => {
  const id = useId();
  const errorId = `${id}-error`;
  const field = useField<string | null | undefined>(form, path);
  return (
    <div className="zf-field">
      {label !== undefined ? (
        <label htmlFor={id} className="zf-label">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        ref={ref}
        {...textInputProps(field)}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-describedby={hasError(field.error) ? errorId : undefined}
      />
      <ErrorText id={errorId} error={field.error} />
    </div>
  );
};

export type DateFieldProps<F extends FieldFormApi = FieldFormApi> = Readonly<{
  form: F;
  path: PathsOf<F>;
  label?: ReactNode;
  min?: string;
  max?: string;
  ref?: FieldRef<HTMLInputElement>;
}>;

// <input type="date"> holds Date-typed state: display and parsing go
// through the shared dateInputProps rules (local calendar-date semantics —
// see inputProps.ts), so a nullable date clears back to null and an
// invalid/partial entry writes the field's emptyValue. No raw-text state:
// unlike number inputs, the date control has no partial entries to
// preserve — the browser only fires change with "" or a complete date.
export const DateField = <F extends FieldFormApi>({
  form,
  path,
  label,
  min,
  max,
  ref,
}: DateFieldProps<F>) => {
  const id = useId();
  const errorId = `${id}-error`;
  const field = useField<Date | null | undefined>(form, path);
  return (
    <div className="zf-field">
      {label !== undefined ? (
        <label htmlFor={id} className="zf-label">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        ref={ref}
        {...dateInputProps(field)}
        min={min}
        max={max}
        aria-describedby={hasError(field.error) ? errorId : undefined}
      />
      <ErrorText id={errorId} error={field.error} />
    </div>
  );
};

export type NumberFieldProps<F extends FieldFormApi = FieldFormApi> =
  Readonly<{
    form: F;
    path: PathsOf<F>;
    label?: ReactNode;
    placeholder?: string;
    ref?: FieldRef<HTMLInputElement>;
  }>;

type NumberInputBinding = Readonly<{
  name: string;
  value: string;
  inputMode: "decimal";
  "aria-invalid": true | undefined;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}>;

type NumberEditState = Readonly<{
  raw: string | null;
  // The form value this hook last wrote (or observed when it kept a partial
  // entry). When field.value diverges, an external writer (reset/adoptValues/
  // another field) changed it — drop the raw text so the input shows it.
  pushed: number | null | undefined;
}>;

const IDLE_EDIT: NumberEditState = { raw: null, pushed: undefined };

// Holds the raw text while editing so intermediate, not-yet-valid numbers
// ("-", "1.", "1e") stay visible instead of being coerced to "". Keystrokes
// that parse to a number (via the shared parseNumberText rules) are pushed to
// the form; partial input is kept locally. On blur the display snaps back to
// the form's canonical value, and an external value change while editing wins
// over the local text (render-phase derived-state reset).
const useNumberInput = (
  field: UseFieldReturn<number | null | undefined>,
): NumberInputBinding => {
  const [edit, setEdit] = useState<NumberEditState>(IDLE_EDIT);
  const externallyChanged =
    edit.raw !== null && !Object.is(field.value, edit.pushed);
  if (externallyChanged) {
    setEdit(IDLE_EDIT);
  }
  const raw = externallyChanged ? null : edit.raw;
  return {
    name: field.path,
    value: raw ?? numberToInputText(field.value),
    inputMode: "decimal",
    "aria-invalid": hasError(field.error) ? true : undefined,
    onChange: (e) => {
      const text = e.target.value;
      const parsed = parseNumberText(text);
      switch (parsed.kind) {
        case "empty": {
          const empty = field.emptyValue;
          setEdit({ raw: text, pushed: empty });
          field.setValue(empty);
          return;
        }
        case "number":
          setEdit({ raw: text, pushed: parsed.value });
          field.setValue(parsed.value);
          return;
        case "invalid":
          // Partial entry: keep the text, remember the untouched form value
          // so it doesn't read as an external change.
          setEdit({ raw: text, pushed: field.value });
          return;
      }
    },
    onBlur: () => {
      setEdit(IDLE_EDIT);
      field.onBlur();
    },
  };
};

export const NumberField = <F extends FieldFormApi>({
  form,
  path,
  label,
  placeholder,
  ref,
}: NumberFieldProps<F>) => {
  const id = useId();
  const errorId = `${id}-error`;
  const field = useField<number | null | undefined>(form, path);
  const binding = useNumberInput(field);
  return (
    <div className="zf-field">
      {label !== undefined ? (
        <label htmlFor={id} className="zf-label">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        ref={ref}
        type="text"
        {...binding}
        placeholder={placeholder}
        aria-describedby={hasError(field.error) ? errorId : undefined}
      />
      <ErrorText id={errorId} error={field.error} />
    </div>
  );
};

export type CheckboxFieldProps<F extends FieldFormApi = FieldFormApi> =
  Readonly<{
    form: F;
    path: PathsOf<F>;
    label?: ReactNode;
    ref?: FieldRef<HTMLInputElement>;
  }>;

export const CheckboxField = <F extends FieldFormApi>({
  form,
  path,
  label,
  ref,
}: CheckboxFieldProps<F>) => {
  const id = useId();
  const errorId = `${id}-error`;
  const field = useField<boolean | null | undefined>(form, path);
  return (
    <div className="zf-field">
      <label htmlFor={id} className="zf-label">
        <input
          id={id}
          ref={ref}
          {...checkboxProps(field)}
          aria-describedby={hasError(field.error) ? errorId : undefined}
        />{" "}
        {label}
      </label>
      <ErrorText id={errorId} error={field.error} />
    </div>
  );
};

export type SelectFieldOption<T extends string> = Readonly<{
  value: T;
  label: ReactNode;
}>;

export type SelectFieldProps<
  T extends string,
  F extends FieldFormApi = FieldFormApi,
> = Readonly<{
  form: F;
  path: PathsOf<F>;
  label?: ReactNode;
  options: readonly SelectFieldOption<T>[];
  // Shown as a disabled first option while the field value is undefined, so
  // the select stays controlled and the blank state is visible instead of
  // silently displaying the first option.
  placeholder?: string;
  ref?: FieldRef<HTMLSelectElement>;
}>;

export const SelectField = <T extends string, F extends FieldFormApi>({
  form,
  path,
  label,
  options,
  placeholder,
  ref,
}: SelectFieldProps<T, F>) => {
  const id = useId();
  const errorId = `${id}-error`;
  // null included: a nullable enum's "not chosen yet" must render the empty
  // option, or the browser shows the first real option while state stays null.
  const field = useField<T | null | undefined>(form, path);
  // A nullable field must be clearable BACK to null through the UI, so its
  // empty option stays visible after a choice and stays selectable —
  // selectProps writes null for it. Everywhere else the empty option is
  // only a placeholder: visible while nothing is chosen, never selectable.
  const clearable = field.emptyValue === null;
  const showEmptyOption =
    clearable ||
    field.value === undefined ||
    field.value === null ||
    placeholder !== undefined;
  return (
    <div className="zf-field">
      {label !== undefined ? (
        <label htmlFor={id} className="zf-label">
          {label}
        </label>
      ) : null}
      <select
        id={id}
        ref={ref}
        {...selectProps(field)}
        aria-describedby={hasError(field.error) ? errorId : undefined}
      >
        {showEmptyOption ? (
          <option value="" disabled={!clearable}>
            {placeholder ?? ""}
          </option>
        ) : null}
        {options.map((opt, index) => (
          // Index-qualified: option lists may legitimately repeat a value
          // (e.g. differently-labelled aliases), and bare value keys would
          // collide.
          <option key={`${index}-${opt.value}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ErrorText id={errorId} error={field.error} />
    </div>
  );
};
