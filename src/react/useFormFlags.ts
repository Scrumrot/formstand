import { useStore } from "zustand/react";
import type { FormStateApi } from "./useFormState";

export const useIsDirty = (form: FormStateApi): boolean =>
  useStore(form.store, (state) => {
    for (const k in state.dirty) {
      if (state.dirty[k] === true) return true;
    }
    return false;
  });

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
