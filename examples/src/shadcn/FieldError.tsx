import { type ErrorSlice, firstError } from "../fieldErrors";

export type FieldErrorProps = Readonly<{
  field: ErrorSlice;
}>;

// The shadcn FormMessage pattern without the Form context machinery:
// formstand's useField already carries the error, so the message renders
// straight off the field slice.
export const FieldError = ({ field }: FieldErrorProps) =>
  firstError(field) !== undefined ? (
    <p data-slot="field-error" className="text-sm text-destructive">
      {firstError(field)}
    </p>
  ) : null;
