import { type ReactNode, useId } from "react";
import {
  checkboxProps,
  numberInputProps,
  selectProps,
  textInputProps,
} from "./inputProps";
import { type FieldFormApi, useField } from "./useField";

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
  step?: number | string;
}>;

export const NumberField = ({
  form,
  path,
  label,
  placeholder,
  step,
}: NumberFieldProps) => {
  const id = useId();
  const field = useField<number | undefined>(form, path);
  return (
    <div className="zf-field">
      {label !== undefined ? (
        <label htmlFor={id} className="zf-label">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        {...numberInputProps(field)}
        placeholder={placeholder}
        step={step}
      />
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
}>;

export const SelectField = <T extends string>({
  form,
  path,
  label,
  options,
}: SelectFieldProps<T>) => {
  const id = useId();
  const field = useField<T>(form, path);
  return (
    <div className="zf-field">
      {label !== undefined ? (
        <label htmlFor={id} className="zf-label">
          {label}
        </label>
      ) : null}
      <select id={id} {...selectProps(field)}>
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
