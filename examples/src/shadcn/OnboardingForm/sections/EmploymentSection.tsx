import { Badge } from "../../ui/badge";
import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { JobTitleField } from "../fields/JobTitleField";
import { DepartmentField } from "../fields/DepartmentField";
import { StartDateField } from "../fields/StartDateField";
import { EmploymentTypeField } from "../fields/EmploymentTypeField";
import { SalaryField } from "../fields/SalaryField";
import { RemoteField } from "../fields/RemoteField";
import { ManagerEmailField } from "../fields/ManagerEmailField";

export type EmploymentSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is the path-scoped flags: dirty/valid for this subtree
// only, rendered as badges in the summary.
export const useEmploymentSection = () => ({
  dirty: useOnboardingIsDirty("employment"),
  valid: useOnboardingIsValid("employment"),
});

export const EmploymentSection = ({
  initiallyOpen = false,
}: EmploymentSectionProps) => {
  const { dirty, valid } = useEmploymentSection();
  return (
    <details className="rounded-lg border" open={initiallyOpen || undefined}>
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
        Employment
        {dirty ? <Badge>edited</Badge> : null}
        {valid ? null : (
          <span className="text-xs text-destructive">needs attention</span>
        )}
      </summary>
      <div className="grid gap-4 px-4 pb-4">
        <JobTitleField />
        <DepartmentField />
        <StartDateField />
        <EmploymentTypeField />
        <SalaryField />
        <RemoteField />
        <ManagerEmailField />
      </div>
    </details>
  );
};
