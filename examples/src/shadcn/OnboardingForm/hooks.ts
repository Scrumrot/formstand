import { createForm, createFormHooks } from "formstand";
import { blankOnboardingValues, onboardingSchema } from "./schema";

// This kit variant owns its own form instance (its state is independent
// of the plain module's) but shares the schema and blank draft with it.
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
