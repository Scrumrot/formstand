import { hasFieldError } from "formstand";

// The accessibility wiring the hand-rolled demos used to skip. formstand's
// bound components (TextField and friends) render an error line with an id
// and point the control at it through aria-describedby; the demos that
// bind raw <input>s with useField / textInputProps rendered a bare
// <span class="error"> instead, so a screen reader heard the field but
// never its message. This is the smallest shared piece that closes the
// gap: spread `control` onto the input (after the prop builder, which
// already sets aria-invalid for its own bindings) and `message` onto the
// error element.
//
// The description is attached only while an error shows, like the bound
// components do, so assistive tech is never pointed at an empty node; the
// message element itself stays mounted (the demos reserve its line height
// with a " " placeholder) so aria-live can announce a message appearing.
export type A11yField = Readonly<{ error: readonly string[] | undefined }>;

export type FieldA11y = Readonly<{
  control: Readonly<{
    id: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  }>;
  message: Readonly<{
    id: string;
    className: "error";
    "aria-live": "polite";
  }>;
}>;

// `id` is the control's id (what the <label htmlFor> points at); the error
// element takes `${id}-error`, the same derivation as the bound components.
export const fieldA11y = (field: A11yField, id: string): FieldA11y => {
  const showing = hasFieldError(field.error);
  const errorId = `${id}-error`;
  return {
    control: {
      id,
      "aria-invalid": showing ? true : undefined,
      "aria-describedby": showing ? errorId : undefined,
    },
    message: { id: errorId, className: "error", "aria-live": "polite" },
  };
};
