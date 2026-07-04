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
    isSubmitting: state.isSubmitting,
    submitCount: state.submitCount,
    isValidating: state.isValidating,
  }));
  // dirtyFields() builds a fresh array per call, so it needs its own
  // shallow-compared subscription — as a key inside the object above, the
  // object's shallow compare would see a new array reference on every pass
  // and loop the store subscription (React error #185).
  const dirtyFields = useFormSelectorShallow(form, () => form.dirtyFields());
  return (
    <pre className="state-dump">
      {JSON.stringify({ ...snapshot, dirtyFields }, null, 2)}
    </pre>
  );
};
