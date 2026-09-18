import { type ChangeEvent, useState } from "react";
import type { UseFieldReturn } from "./useField";
import { hasFieldError } from "./inputProps";

// The raw-text editing pattern behind NumberField/useNumberInput,
// generalized to ANY parsed-and-formatted value: phone numbers, currency,
// percentages, locale-formatted anything. A naive controlled input
// re-renders the canonical format on every keystroke, which eats the
// separators and partial entries the user is mid-way through typing. This
// hook keeps the raw text locally while editing, pushes PARSED values to
// the form as soon as a keystroke parses, and snaps the display back to
// the canonical format on blur — so the form always holds a real value
// while the input stays typeable.

export type MaskedParse<TValue> =
  // A complete value — pushed to the form immediately.
  | Readonly<{ kind: "value"; value: TValue }>
  // Nothing entered — the field's emptyValue is pushed (null/undefined
  // per the schema, same rule as the number and date bindings).
  | Readonly<{ kind: "empty" }>
  // A partial or unparseable entry — kept as local text, the form value
  // untouched (matching useNumberInput's deliberate semantics).
  | Readonly<{ kind: "invalid" }>;

export type MaskedInputOptions<TValue> = Readonly<{
  // The single rule for turning user-typed text into a field value.
  parse: (text: string) => MaskedParse<TValue>;
  // Canonical display text for a field value — what blur snaps back to.
  format: (value: TValue) => string;
}>;

export type MaskedInputBinding = Readonly<{
  name: string;
  value: string;
  "aria-invalid": true | undefined;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}>;

type MaskedEditState<TValue> = Readonly<{
  raw: string | null;
  // The form value this hook last wrote (or observed when it kept a
  // partial entry). When field.value diverges, an external writer
  // (reset/adoptValues/another component) changed it — drop the raw text
  // so the input shows the external value.
  pushed: TValue | null | undefined;
}>;

// Generic over the field's OWN value type (nullability included), so an
// optional field binds as naturally as a nullable one: parse/format speak
// the non-null value, and the nullish side is the emptyValue round trip.
export const useMaskedInput = <TValue>(
  field: UseFieldReturn<TValue>,
  options: MaskedInputOptions<NonNullable<TValue>>,
): MaskedInputBinding => {
  const [edit, setEdit] = useState<MaskedEditState<TValue>>({
    raw: null,
    pushed: undefined,
  });
  // Render-phase derived-state reset, same as useNumberInput: an external
  // value change while editing wins over the local text. Object.is works
  // for reference values too — the hook pushed the very instance it holds.
  const externallyChanged =
    edit.raw !== null && !Object.is(field.value, edit.pushed);
  if (externallyChanged) {
    setEdit({ raw: null, pushed: undefined });
  }
  const raw = externallyChanged ? null : edit.raw;
  return {
    name: field.path,
    value:
      raw ??
      (field.value === undefined || field.value === null
        ? ""
        : options.format(field.value as NonNullable<TValue>)),
    "aria-invalid": hasFieldError(field.error) ? true : undefined,
    onChange: (e) => {
      const text = e.target.value;
      const parsed = options.parse(text);
      switch (parsed.kind) {
        case "value":
          setEdit({ raw: text, pushed: parsed.value });
          field.setValue(parsed.value);
          return;
        case "empty": {
          // The schema-legal blank (null/nullable, undefined/optional) —
          // the same write every other clearing binding performs; the
          // cast is the emptyValue contract, not a guess.
          const empty = field.emptyValue as TValue;
          setEdit({ raw: text, pushed: empty });
          field.setValue(empty);
          return;
        }
        case "invalid":
          // Partial entry: keep the text, remember the untouched form
          // value so it doesn't read as an external change.
          setEdit({ raw: text, pushed: field.value });
          return;
      }
    },
    onBlur: () => {
      // Snap the display to the canonical format of whatever the form
      // holds, then run the field's ordinary blur (touched + mode gate).
      setEdit({ raw: null, pushed: undefined });
      field.onBlur();
    },
  };
};
