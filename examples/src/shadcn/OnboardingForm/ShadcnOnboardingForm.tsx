import { useDemoForm } from "../../demo/DemoShell";
import { Button } from "../ui/button";
import {
  onboardingForm,
  useOnboardingIsDirty,
  useOnboardingIsSubmitting,
  useOnboardingIsValid,
} from "./hooks";
import { AddressSection } from "./sections/AddressSection";
import { EmergencyContactsSection } from "./sections/EmergencyContactsSection";
import { EmploymentSection } from "./sections/EmploymentSection";
import { EquipmentSection } from "./sections/EquipmentSection";
import { PersonalSection } from "./sections/PersonalSection";

// The Onboarding feature module rendered through shadcn/ui — the same
// shared schema and hook architecture as the plain and MUI variants.
export const ShadcnOnboardingForm = () => {
  useDemoForm(onboardingForm);
  const isDirty = useOnboardingIsDirty();
  const isValid = useOnboardingIsValid();
  const submitting = useOnboardingIsSubmitting();

  return (
    <form
      className="grid gap-3"
      onSubmit={onboardingForm.handleSubmit((data) => {
        window.alert(`welcome aboard, ${data.personal.firstName}!`);
      })}
    >
      <p className="text-sm text-muted-foreground">
        Sections are collapsible with badges from the path-scoped{" "}
        <code>useOnboardingIsDirty("personal")</code> /{" "}
        <code>useOnboardingIsValid("personal")</code> flags.
      </p>
      <PersonalSection />
      <AddressSection />
      <EmploymentSection />
      <EquipmentSection />
      <EmergencyContactsSection />
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={submitting}>
          Complete onboarding
        </Button>
        <Button
          variant="outline"
          disabled={!isDirty}
          onClick={() => onboardingForm.reset()}
        >
          Reset
        </Button>
        <span className="text-sm text-muted-foreground">
          {isDirty ? "unsaved changes" : "pristine"}
          {" · "}
          {isValid ? "no errors" : "has errors"}
        </span>
      </div>
    </form>
  );
};
