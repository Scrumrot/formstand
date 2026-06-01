import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import type { FormStateApi } from "./useFormState";

export const useFormError = (
  form: FormStateApi,
): readonly string[] | undefined =>
  useStore(
    form.store,
    useShallow((state) => state.errors[""]),
  );
