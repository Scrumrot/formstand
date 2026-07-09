import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  Stack,
} from "@mui/material";
import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { LaptopField } from "../fields/LaptopField";
import { MonitorCountField } from "../fields/MonitorCountField";
import { NeedsPhoneField } from "../fields/NeedsPhoneField";
import { ShirtSizeField } from "../fields/ShirtSizeField";
import { NotesField } from "../fields/NotesField";

export type EquipmentSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is the path-scoped flags: dirty/valid for this subtree
// only, rendered as chips in the accordion header.
export const useEquipmentSection = () => ({
  dirty: useOnboardingIsDirty("equipment"),
  valid: useOnboardingIsValid("equipment"),
});

export const EquipmentSection = ({
  initiallyOpen = false,
}: EquipmentSectionProps) => {
  const { dirty, valid } = useEquipmentSection();
  return (
    <Accordion defaultExpanded={initiallyOpen} disableGutters variant="outlined">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <span>Equipment</span>
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
          <LaptopField />
          <MonitorCountField />
          <NeedsPhoneField />
          <ShirtSizeField />
          <NotesField />
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
