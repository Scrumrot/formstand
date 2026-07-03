import type { z } from "zod";
import type { Form } from "formstand";
import { useFormSelectorShallow } from "formstand";

export type StateDumpProps<TSchema extends z.ZodType> = Readonly<{
  form: Form<TSchema>;
}>;

export const StateDump = <TSchema extends z.ZodType>({
  form,
}: StateDumpProps<TSchema>) => {
  const snapshot = useFormSelectorShallow(form, (state) => ({
    values: state.values,
    // The merged map hooks read; serverErrors is the app-owned channel that
    // survives validation passes (schemaErrors is the validation-owned one).
    errors: state.errors,
    serverErrors: state.serverErrors,
    touched: state.touched,
    // Dirtiness is derived from values vs initialValues, not stored state.
    dirtyFields: form.dirtyFields(),
    isSubmitting: state.isSubmitting,
    submitCount: state.submitCount,
    isValidating: state.isValidating,
  }));
  return <pre className="state-dump">{JSON.stringify(snapshot, null, 2)}</pre>;
};
