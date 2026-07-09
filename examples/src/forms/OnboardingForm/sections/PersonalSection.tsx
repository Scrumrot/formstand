import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { FirstNameField } from "../fields/FirstNameField";
import { LastNameField } from "../fields/LastNameField";
import { PreferredNameField } from "../fields/PreferredNameField";
import { EmailField } from "../fields/EmailField";
import { PhoneField } from "../fields/PhoneField";

export type PersonalSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is just the path-scoped flags: dirty/valid for this
// subtree only, as boolean-only subscriptions.
export const usePersonalSection = () => ({
  dirty: useOnboardingIsDirty("personal"),
  valid: useOnboardingIsValid("personal"),
});

export const PersonalSection = ({
  initiallyOpen = true,
}: PersonalSectionProps) => {
  const { dirty, valid } = usePersonalSection();
  return (
    <details open={initiallyOpen || undefined}>
      <summary style={{ cursor: "pointer", marginBottom: 8 }}>
        <strong>Personal</strong>{" "}
        {dirty ? <span className="pending">edited</span> : null}{" "}
        {valid ? null : <span className="error">needs attention</span>}
      </summary>
      <FirstNameField />
      <LastNameField />
      <PreferredNameField />
      <EmailField />
      <PhoneField />
    </details>
  );
};
