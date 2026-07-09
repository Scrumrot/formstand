import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  Stack,
} from "@mui/material";
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
// only, rendered as chips in the accordion header.
export const useEmploymentSection = () => ({
  dirty: useOnboardingIsDirty("employment"),
  valid: useOnboardingIsValid("employment"),
});

export const EmploymentSection = ({
  initiallyOpen = false,
}: EmploymentSectionProps) => {
  const { dirty, valid } = useEmploymentSection();
  return (
    <Accordion defaultExpanded={initiallyOpen} disableGutters variant="outlined">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <span>Employment</span>
          {dirty ? (
            <Chip size="small" color="warning" variant="outlined" label="edited" />
          ) : null}
          {valid ? null : (
            <Chip
              size="small"
              color="error"
              variant="outlined"
              label="needs attention"
            />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <JobTitleField />
          <DepartmentField />
          <StartDateField />
          <EmploymentTypeField />
          <SalaryField />
          <RemoteField />
          <ManagerEmailField />
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
