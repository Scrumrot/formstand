import { createForm, createFormHooks } from "formstand";
import { onboardingSchema } from "./schema";
import type { OnboardingValues } from "./types";

// A blank form starts with required numbers/enums undefined and nullable
// fields null — deliberately not schema-satisfying yet (the cast below);
// validation reports the gaps on submit.
const initialValues = {
  personal: {
    firstName: "",
    lastName: "",
    preferredName: null,
    email: "",
    phone: "",
  },
  address: {
    street: "",
    unit: null,
    city: "",
    region: undefined,
    postalCode: "",
    country: undefined,
  },
  employment: {
    jobTitle: "",
    department: undefined,
    startDate: "",
    employmentType: "full-time",
    salary: undefined,
    remote: false,
    managerEmail: "",
  },
  equipment: {
    laptop: undefined,
    monitorCount: 1,
    needsPhone: false,
    shirtSize: undefined,
    notes: null,
  },
  emergencyContacts: [{ name: "", relationship: "", phone: "" }],
} as unknown as OnboardingValues;

// One module-level form for the whole feature; everything below imports
// these hooks instead of receiving `form` via props or a provider. (This is
// the createFormHooks singleton pattern — for a per-mount lifecycle, use
// useForm + createFormContext instead.)
export const onboardingForm = createForm(onboardingSchema, {
  initialValues,
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
