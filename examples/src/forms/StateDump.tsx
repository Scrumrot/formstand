import type { z } from "zod";
import type { Form } from "zustand-forms";
import { useFormSelectorShallow } from "zustand-forms";

export type StateDumpProps<TSchema extends z.ZodType> = Readonly<{
  form: Form<TSchema>;
}>;

export const StateDump = <TSchema extends z.ZodType>({
  form,
}: StateDumpProps<TSchema>) => {
  const snapshot = useFormSelectorShallow(form, (state) => ({
    values: state.values,
    errors: state.errors,
    touched: state.touched,
    // Dirtiness is derived from values vs initialValues, not stored state.
    dirtyFields: form.dirtyFields(),
    isSubmitting: state.isSubmitting,
    submitCount: state.submitCount,
    isValidating: state.isValidating,
  }));
  return <pre className="state-dump">{JSON.stringify(snapshot, null, 2)}</pre>;
};
