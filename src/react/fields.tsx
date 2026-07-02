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
  pushed: number | undefined;
}>;

const IDLE_EDIT: NumberEditState = { raw: null, pushed: undefined };

// Holds the raw text while editing so intermediate, not-yet-valid numbers
// ("-", "1.", "1e") stay visible instead of being coerced to "". Keystrokes
// that parse to a finite number are pushed to the form (whitespace counts as
// empty; Infinity is rejected); partial input is kept locally. On blur the
// display snaps back to the form's canonical value, and an external value
// change while editing wins over the local text (render-phase derived-state
// reset).
const useNumberInput = (
  field: UseFieldReturn<number | undefined>,
): NumberInputBinding => {
  const [edit, setEdit] = useState<NumberEditState>(IDLE_EDIT);
  const externallyChanged =
    edit.raw !== null && !Object.is(field.value, edit.pushed);
  if (externallyChanged) {
    setEdit(IDLE_EDIT);
  }
  const raw = externallyChanged ? null : edit.raw;
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
      if (text.trim() === "") {
        setEdit({ raw: text, pushed: undefined });
        field.setValue(undefined);
        return;
      }
      const parsed = Number(text);
      if (Number.isFinite(parsed)) {
        setEdit({ raw: text, pushed: parsed });
        field.setValue(parsed);
      } else {
        // Partial entry: keep the text, remember the untouched form value so
        // it doesn't read as an external change.
        setEdit({ raw: text, pushed: field.value });
      }
    },
    onBlur: () => {
      setEdit(IDLE_EDIT);
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
