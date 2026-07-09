import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  Stack,
} from "@mui/material";
import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { StreetField } from "../fields/StreetField";
import { UnitField } from "../fields/UnitField";
import { CityField } from "../fields/CityField";
import { RegionField } from "../fields/RegionField";
import { PostalCodeField } from "../fields/PostalCodeField";
import { CountryField } from "../fields/CountryField";

export type AddressSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is the path-scoped flags: dirty/valid for this subtree
// only, rendered as chips in the accordion header.
export const useAddressSection = () => ({
  dirty: useOnboardingIsDirty("address"),
  valid: useOnboardingIsValid("address"),
});

export const AddressSection = ({
  initiallyOpen = false,
}: AddressSectionProps) => {
  const { dirty, valid } = useAddressSection();
  return (
    <Accordion defaultExpanded={initiallyOpen} disableGutters variant="outlined">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <span>Address</span>
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
          <StreetField />
          <UnitField />
          <CityField />
          <RegionField />
          <PostalCodeField />
          <CountryField />
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
