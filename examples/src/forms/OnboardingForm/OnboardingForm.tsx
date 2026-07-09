import { useDemoForm } from "../../demo/DemoShell";
import {
  onboardingForm,
  useOnboardingIsDirty,
  useOnboardingIsSubmitting,
  useOnboardingIsValid,
  useOnboardingSubmitCount,
} from "./hooks";
import { AddressSection } from "./sections/AddressSection";
import { EmergencyContactsSection } from "./sections/EmergencyContactsSection";
import { EmploymentSection } from "./sections/EmploymentSection";
import { EquipmentSection } from "./sections/EquipmentSection";
import { PersonalSection } from "./sections/PersonalSection";

// The form body composes sections; sections compose fields; fields bind
// paths. Nothing in this tree passes `form` — every hook comes pre-wired
// from ./hooks (createFormHooks over one module-level form; useForm +
// createFormContext is the per-mount alternative).
export const OnboardingForm = () => {
  useDemoForm(onboardingForm);
  const isDirty = useOnboardingIsDirty();
  const isValid = useOnboardingIsValid();
  const isSubmitting = useOnboardingIsSubmitting();
  const submitCount = useOnboardingSubmitCount();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onboardingForm.submit((data) => {
          window.alert(
            `welcome aboard, ${data.personal.firstName}! ` +
              `(${data.emergencyContacts.length} emergency contact(s) on file)`,
          );
        });
      }}
    >
      <p style={{ color: "#8b94a7", fontSize: 13, marginTop: 0 }}>
        A 26-field, five-section feature module: <code>schema.ts</code> →{" "}
        <code>hooks.ts</code> (<code>createFormHooks</code>) → one file per
        field, one per section. Section headers show the path-scoped{" "}
        <code>useOnboardingIsDirty("personal")</code> /{" "}
        <code>useOnboardingIsValid("personal")</code> flags live.
      </p>

      <PersonalSection />
      <AddressSection />
      <EmploymentSection />
      <EquipmentSection />
      <EmergencyContactsSection />

      <div className="row" style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting…" : "Complete onboarding"}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={!isDirty}
          onClick={() => onboardingForm.reset()}
        >
          Reset
        </button>
        <span style={{ color: "#8b94a7", fontSize: 13 }}>
          {isDirty ? "unsaved changes" : "pristine"}
          {" · "}
          {isValid ? "no errors" : "has errors"}
          {submitCount > 0 ? ` · ${submitCount} attempt(s)` : ""}
        </span>
      </div>
    </form>
  );
};
