import { useStore } from "zustand/react";
import { isFieldDirty } from "../core/equality";
import type { FormStateApi } from "./useFormSelector";

// Derived from the values (memoized per values reference), so it always
// agrees with per-field dirty reads.
export const useIsDirty = (form: FormStateApi): boolean =>
  useStore(form.store, (state) =>
    isFieldDirty(state.values, state.initialValues),
  );

export const useIsValid = (form: FormStateApi): boolean =>
  useStore(form.store, (state) => {
    for (const k in state.errors) {
      const errs = state.errors[k];
      if (errs !== undefined && errs.length > 0) return false;
    }
    return true;
  });

export const useIsSubmitting = (form: FormStateApi): boolean =>
  useStore(form.store, (state) => state.isSubmitting);

export const useSubmitCount = (form: FormStateApi): number =>
  useStore(form.store, (state) => state.submitCount);
