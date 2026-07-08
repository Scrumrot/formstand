export type FieldErrorProps = Readonly<{
  field: Readonly<{ error: readonly string[] | undefined }>;
}>;

// The shadcn FormMessage pattern without the Form context machinery:
// formstand's useField already carries the error, so the message renders
// straight off the field slice.
export const FieldError = ({ field }: FieldErrorProps) =>
  field.error?.[0] !== undefined ? (
    <p data-slot="field-error" className="text-sm text-destructive">
      {field.error[0]}
    </p>
  ) : null;
