import { type ChangeEvent, type ReactNode, useId, useState } from "react";
import type { z } from "zod";
import type { Form } from "../core/createForm";
import type { FieldPath, PathDepth } from "../core/fieldPath";
import {
  checkboxProps,
  dateInputProps,
  hasFieldError,
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
// The form's own depth budget (createForm's `pathDepth`, default 9) is
// recovered alongside the schema, so a widened form widens its bound
// components' paths too.
export type PathsOf<F extends FieldFormApi> = F extends Form<
  infer TSchema extends z.ZodType,
  infer D extends PathDepth
>
  ? FieldPath<z.input<TSchema>, D>
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

// The chrome every bound field renders: wrapper, optional label, the
// control, and the error line. `wrapLabel` puts the control INSIDE the
// label (the checkbox layout: box, then text) instead of after a preceding
// sibling label. One component so an a11y change lands everywhere at once.
type FieldShellProps = Readonly<{
  id: string;
  errorId: string;
  label: ReactNode | undefined;
  error: readonly string[] | undefined;
  wrapLabel?: boolean;
  children: ReactNode;
}>;

// Shared id wiring for every bound field: a stable control id, the error
// line's id derived from it, and the aria-describedby value — set only
// while an error shows, so assistive tech is never pointed at a node that
// isn't rendered.
const useFieldA11y = (
  error: readonly string[] | undefined,
): Readonly<{ id: string; errorId: string; describedBy: string | undefined }> => {
  const id = useId();
  const errorId = `${id}-error`;
  return {
    id,
    errorId,
    describedBy: hasFieldError(error) ? errorId : undefined,
  };
};

// role="alert" announces the message to assistive tech when it appears; the
// id lets the input point at it via aria-describedby.
const ErrorText = ({
  id,
  error,
}: Readonly<{ id: string; error: readonly string[] | undefined }>) =>
  hasFieldError(error) ? (
    <span className="zf-error" id={id} role="alert">
      {error?.[0]}
    </span>
  ) : null;

const FieldShell = ({
  id,
  errorId,
  label,
  error,
  wrapLabel,
  children,
}: FieldShellProps) => (
  <div className="zf-field">
    {wrapLabel === true ? (
      <label htmlFor={id} className="zf-label">
        {children} {label}
      </label>
    ) : (
      <>
        {label !== undefined ? (
          <label htmlFor={id} className="zf-label">
            {label}
          </label>
        ) : null}
        {children}
      </>
    )}
    <ErrorText id={errorId} error={error} />
  </div>
);

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
  const field = useField<string | null | undefined>(form, path);
  const a11y = useFieldA11y(field.error);
  return (
    <FieldShell
      id={a11y.id}
      errorId={a11y.errorId}
      label={label}
      error={field.error}
    >
      <input
        id={a11y.id}
        ref={ref}
        {...textInputProps(field)}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-describedby={a11y.describedBy}
      />
    </FieldShell>
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
  const field = useField<Date | null | undefined>(form, path);
  const a11y = useFieldA11y(field.error);
  return (
    <FieldShell
      id={a11y.id}
      errorId={a11y.errorId}
      label={label}
      error={field.error}
    >
      <input
        id={a11y.id}
        ref={ref}
        {...dateInputProps(field)}
        min={min}
        max={max}
        aria-describedby={a11y.describedBy}
      />
    </FieldShell>
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

export type NumberInputBinding = Readonly<{
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
// Exported for custom number inputs (and the CLI's kit adapters mirror its
// semantics): spread the binding onto an <input type="text"> — a naive
// value={String(field.value)} controlled input eats the "." of "85000.50"
// and the "-" of "-5" as they're typed.
export const useNumberInput = (
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
    "aria-invalid": hasFieldError(field.error) ? true : undefined,
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
  const field = useField<number | null | undefined>(form, path);
  const binding = useNumberInput(field);
  const a11y = useFieldA11y(field.error);
  return (
    <FieldShell
      id={a11y.id}
      errorId={a11y.errorId}
      label={label}
      error={field.error}
    >
      <input
        id={a11y.id}
        ref={ref}
        type="text"
        {...binding}
        placeholder={placeholder}
        aria-describedby={a11y.describedBy}
      />
    </FieldShell>
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
  const field = useField<boolean | null | undefined>(form, path);
  const a11y = useFieldA11y(field.error);
  return (
    <FieldShell
      id={a11y.id}
      errorId={a11y.errorId}
      label={label}
      error={field.error}
      wrapLabel
    >
      <input
        id={a11y.id}
        ref={ref}
        {...checkboxProps(field)}
        aria-describedby={a11y.describedBy}
      />
    </FieldShell>
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
  // Shown as a disabled first option while the field has no value, so the
  // select stays controlled and the blank state is visible instead of
  // silently displaying the first option. Ignored when `options` itself
  // contains a ""-valued entry — that explicit, labelled option IS the
  // blank state and renders instead.
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
  // null included: a nullable enum's "not chosen yet" must render the empty
  // option, or the browser shows the first real option while state stays null.
  const field = useField<T | null | undefined>(form, path);
  const a11y = useFieldA11y(field.error);
  const select = selectProps(field);
  // A nullable field must be clearable BACK to null through the UI, so its
  // empty option stays visible after a choice and stays selectable —
  // selectProps writes null for it. Everywhere else the empty option is
  // only a placeholder: visible while nothing is chosen, never selectable.
  // The value condition derives from selectProps' own coercion (undefined,
  // null, and "" all render as value ""), so any blank the select displays
  // has a matching option by construction. When the options list supplies
  // its OWN ""-valued entry, that explicit option IS the blank state —
  // rendering the implicit one too would duplicate the value, and the
  // browser would select the first (unlabelled) match instead.
  const clearable = field.emptyValue === null;
  const hasExplicitEmptyOption = options.some((opt) => opt.value === "");
  const showEmptyOption =
    !hasExplicitEmptyOption &&
    (clearable || select.value === "" || placeholder !== undefined);
  return (
    <FieldShell
      id={a11y.id}
      errorId={a11y.errorId}
      label={label}
      error={field.error}
    >
      <select
        id={a11y.id}
        ref={ref}
        {...select}
        aria-describedby={a11y.describedBy}
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
    </FieldShell>
  );
};
