import type { z } from "zod";
import type { Form } from "zustand-forms";
import { useFormStateShallow } from "zustand-forms";

export type StateDumpProps<TSchema extends z.ZodType> = Readonly<{
  form: Form<TSchema>;
}>;

export const StateDump = <TSchema extends z.ZodType>({
  form,
}: StateDumpProps<TSchema>) => {
  const snapshot = useFormStateShallow(form, (state) => ({
    values: state.values,
    errors: state.errors,
    touched: state.touched,
    dirty: state.dirty,
    isSubmitting: state.isSubmitting,
    submitCount: state.submitCount,
    isValidating: state.isValidating,
  }));
  return <pre className="state-dump">{JSON.stringify(snapshot, null, 2)}</pre>;
};
