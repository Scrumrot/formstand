import { type ChangeEvent, type ReactNode, useId, useState } from "react";
import { checkboxProps, selectProps, textInputProps } from "./inputProps";
import { type FieldFormApi, type UseFieldReturn, useField } from "./useField";

const ErrorText = ({
  error,
}: Readonly<{ error: readonly string[] | undefined }>) =>
  error !== undefined && error.length > 0 ? (
    <span className="zf-error">{error[0]}</span>
  ) : null;

export type TextFieldProps = Readonly<{
  form: FieldFormApi;
  path: string;
  label?: ReactNode;
  placeholder?: string;
  type?: "text" | "password" | "email" | "url" | "tel";
  autoComplete?: string;
}>;

export const TextField = ({
  form,
  path,
  label,
  placeholder,
  type = "text",
  autoComplete,
}: TextFieldProps) => {
  const id = useId();
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
        {...textInputProps(field)}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <ErrorText error={field.error} />
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
}>;

type NumberInputBinding = Readonly<{
  value: string;
  inputMode: "decimal";
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
    value: raw ?? canonical,
    inputMode: "decimal",
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
}: NumberFieldProps) => {
  const id = useId();
  const field = useField<number | undefined>(form, path);
  const binding = useNumberInput(field);
  return (
    <div className="zf-field">
      {label !== undefined ? (
        <label htmlFor={id} className="zf-label">
          {label}
        </label>
      ) : null}
      <input id={id} type="text" {...binding} placeholder={placeholder} />
      <ErrorText error={field.error} />
    </div>
  );
};

export type CheckboxFieldProps = Readonly<{
  form: FieldFormApi;
  path: string;
  label?: ReactNode;
}>;

export const CheckboxField = ({ form, path, label }: CheckboxFieldProps) => {
  const id = useId();
  const field = useField<boolean | undefined>(form, path);
  return (
    <div className="zf-field">
      <label htmlFor={id} className="zf-label">
        <input id={id} {...checkboxProps(field)} /> {label}
      </label>
      <ErrorText error={field.error} />
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
}>;

export const SelectField = <T extends string>({
  form,
  path,
  label,
  options,
  placeholder,
}: SelectFieldProps<T>) => {
  const id = useId();
  const field = useField<T | undefined>(form, path);
  const showEmptyOption = field.value === undefined || placeholder !== undefined;
  return (
    <div className="zf-field">
      {label !== undefined ? (
        <label htmlFor={id} className="zf-label">
          {label}
        </label>
      ) : null}
      <select id={id} {...selectProps(field)}>
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
      <ErrorText error={field.error} />
    </div>
  );
};
