import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { JobTitleField } from "../fields/JobTitleField";
import { DepartmentField } from "../fields/DepartmentField";
import { StartDateField } from "../fields/StartDateField";
import { EmploymentTypeField } from "../fields/EmploymentTypeField";
import { SalaryField } from "../fields/SalaryField";
import { RemoteField } from "../fields/RemoteField";
import { ManagerEmailField } from "../fields/ManagerEmailField";

export type EmploymentSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is just the path-scoped flags: dirty/valid for this
// subtree only, as boolean-only subscriptions.
export const useEmploymentSection = () => ({
  dirty: useOnboardingIsDirty("employment"),
  valid: useOnboardingIsValid("employment"),
});

export const EmploymentSection = ({
  initiallyOpen = false,
}: EmploymentSectionProps) => {
  const { dirty, valid } = useEmploymentSection();
  return (
    <details open={initiallyOpen || undefined}>
      <summary style={{ cursor: "pointer", marginBottom: 8 }}>
        <strong>Employment</strong>{" "}
        {dirty ? <span className="pending">edited</span> : null}{" "}
        {valid ? null : <span className="error">needs attention</span>}
      </summary>
      <JobTitleField />
      <DepartmentField />
      <StartDateField />
      <EmploymentTypeField />
      <SalaryField />
      <RemoteField />
      <ManagerEmailField />
    </details>
  );
};
