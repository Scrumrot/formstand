// The one definition of "this field slice has an error", shared by every
// adapter in the playground (MUI, shadcn) and the shadcn FieldError line —
// four hand-synced copies of this predicate is how one adapter ends up
// styling stale errors while the others move on.

export type ErrorSlice = Readonly<{ error: readonly string[] | undefined }>;

export const hasError = (field: ErrorSlice): boolean =>
  field.error !== undefined && field.error.length > 0;

export const firstError = (field: ErrorSlice): string | undefined =>
  field.error?.[0];

// aria-invalid only when true — `aria-invalid="false"` is noise for screen
// readers and would make every pristine control style-relevant.
export const ariaInvalid = (field: ErrorSlice): true | undefined =>
  hasError(field) ? true : undefined;
