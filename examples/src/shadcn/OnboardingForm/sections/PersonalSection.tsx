import { Badge } from "../../ui/badge";
import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { FirstNameField } from "../fields/FirstNameField";
import { LastNameField } from "../fields/LastNameField";
import { PreferredNameField } from "../fields/PreferredNameField";
import { EmailField } from "../fields/EmailField";
import { PhoneField } from "../fields/PhoneField";

export type PersonalSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is the path-scoped flags: dirty/valid for this subtree
// only, rendered as badges in the summary.
export const usePersonalSection = () => ({
  dirty: useOnboardingIsDirty("personal"),
  valid: useOnboardingIsValid("personal"),
});

export const PersonalSection = ({
  initiallyOpen = true,
}: PersonalSectionProps) => {
  const { dirty, valid } = usePersonalSection();
  return (
    <details className="rounded-lg border" open={initiallyOpen || undefined}>
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
        Personal
        {dirty ? <Badge>edited</Badge> : null}
        {valid ? null : (
          <span className="text-xs text-destructive">needs attention</span>
        )}
      </summary>
      <div className="grid gap-4 px-4 pb-4">
        <FirstNameField />
        <LastNameField />
        <PreferredNameField />
        <EmailField />
        <PhoneField />
      </div>
    </details>
  );
};
