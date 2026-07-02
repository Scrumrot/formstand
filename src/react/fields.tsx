import { type ChangeEvent, type ReactNode, useId, useState } from "react";
import { checkboxProps, selectProps, textInputProps } from "./inputProps";
import { type FieldFormApi, type UseFieldReturn, useField } from "./useField";

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

export type TextFieldProps = Readonly<{
  form: FieldFormApi;
  path: string;
  label?: ReactNode;
  placeholder?: string;
  type?: "text" | "password" | "email" | "url" | "tel";
  autoComplete?: string;
  ref?: FieldRef<HTMLInputElement>;
}>;

export const TextField = ({
  form,
  path,
  label,
  placeholder,
  type = "text",
  autoComplete,
  ref,
}: TextFieldProps) => {
  const id = useId();
  const errorId = `${id}-error`;
  const field = useField<string | undefined>(form, path);
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

export type NumberFieldProps = Readonly<{
  form: FieldFormApi;
  path: string;
  label?: ReactNode;
  placeholder?: string;
  // No longer applied: NumberField renders a text input with
  // inputMode="decimal" so partial entries ("-", "1.", "1e") survive while
  // typing. For a native numeric stepper, spread `numberInputProps` onto your
  // own <input type="number" step={...} />.
  step?: number | string;
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

// Holds the raw text while editing so intermediate, not-yet-valid numbers
// ("-", "1.", "1e") stay visible instead of being coerced to "". Each keystroke
// that parses to a finite number is pushed to the form; partial input is kept
// locally without writing NaN/undefined. On blur the display snaps back to the
// form's canonical value.
const useNumberInput = (
  field: UseFieldReturn<number | undefined>,
): NumberInputBinding => {
  const [raw, setRaw] = useState<string | null>(null);
  const canonical =
    field.value === undefined || Number.isNaN(field.value)
      ? ""
      : String(field.value);
  return {
    name: field.path,
    value: raw ?? canonical,
    inputMode: "decimal",
    "aria-invalid": hasError(field.error) ? true : undefined,
    onChange: (e) => {
      const text = e.target.value;
      setRaw(text);
      if (text === "") {
        field.setValue(undefined);
        return;
      }
      const parsed = Number(text);
      if (!Number.isNaN(parsed)) {
        field.setValue(parsed);
      }
    },
    onBlur: () => {
      setRaw(null);
      field.onBlur();
    },
  };
};

export const NumberField = ({
  form,
  path,
  label,
  placeholder,
  ref,
}: NumberFieldProps) => {
  const id = useId();
  const errorId = `${id}-error`;
  const field = useField<number | undefined>(form, path);
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

export type CheckboxFieldProps = Readonly<{
  form: FieldFormApi;
  path: string;
  label?: ReactNode;
  ref?: FieldRef<HTMLInputElement>;
}>;

export const CheckboxField = ({ form, path, label, ref }: CheckboxFieldProps) => {
  const id = useId();
  const errorId = `${id}-error`;
  const field = useField<boolean | undefined>(form, path);
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

export type SelectFieldProps<T extends string> = Readonly<{
  form: FieldFormApi;
  path: string;
  label?: ReactNode;
  options: readonly SelectFieldOption<T>[];
  // Shown as a disabled first option while the field value is undefined, so
  // the select stays controlled and the blank state is visible instead of
  // silently displaying the first option.
  placeholder?: string;
  ref?: FieldRef<HTMLSelectElement>;
}>;

export const SelectField = <T extends string>({
  form,
  path,
  label,
  options,
  placeholder,
  ref,
}: SelectFieldProps<T>) => {
  const id = useId();
  const errorId = `${id}-error`;
  const field = useField<T | undefined>(form, path);
  const showEmptyOption = field.value === undefined || placeholder !== undefined;
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
          <option value="" disabled>
            {placeholder ?? ""}
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ErrorText id={errorId} error={field.error} />
    </div>
  );
};
