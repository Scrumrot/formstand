import { createForm, createFormHooks } from "formstand";
import { blankOnboardingValues, onboardingSchema } from "./schema";

// One module-level form for the whole feature; everything below imports
// these hooks instead of receiving `form` via props or a provider. (This is
// the createFormHooks singleton pattern; for a per-mount lifecycle, use
// useForm + createFormContext instead.)
export const onboardingForm = createForm(onboardingSchema, {
  initialValues: blankOnboardingValues,
  mode: "onBlur",
});

export const {
  useOnboardingField,
  useOnboardingFieldArray,
  useOnboardingSelector,
  useOnboardingIsDirty,
  useOnboardingIsValid,
  useOnboardingIsSubmitting,
  useOnboardingSubmitCount,
} = createFormHooks(onboardingForm, "onboarding");
