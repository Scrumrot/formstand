import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  Stack,
} from "@mui/material";
import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { FirstNameField } from "../fields/FirstNameField";
import { LastNameField } from "../fields/LastNameField";
import { PreferredNameField } from "../fields/PreferredNameField";
import { EmailField } from "../fields/EmailField";
import { PhoneField } from "../fields/PhoneField";

export type PersonalSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is the path-scoped flags: dirty/valid for this subtree
// only, rendered as chips in the accordion header.
export const usePersonalSection = () => ({
  dirty: useOnboardingIsDirty("personal"),
  valid: useOnboardingIsValid("personal"),
});

export const PersonalSection = ({
  initiallyOpen = true,
}: PersonalSectionProps) => {
  const { dirty, valid } = usePersonalSection();
  return (
    <Accordion defaultExpanded={initiallyOpen} disableGutters variant="outlined">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <span>Personal</span>
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
          <FirstNameField />
          <LastNameField />
          <PreferredNameField />
          <EmailField />
          <PhoneField />
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
