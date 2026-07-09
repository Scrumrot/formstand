import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Chip,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import {
  useOnboardingField,
  useOnboardingFieldArray,
  useOnboardingIsDirty,
  useOnboardingIsValid,
} from "../hooks";

export type EmergencyContactsSectionProps = Readonly<{
  initiallyOpen?: boolean;
}>;

// The array section's hook carries the field array alongside the
// path-scoped flags; row fields bind template paths, so they stay
// schema-typed.
export const useEmergencyContactsSection = () => ({
  contacts: useOnboardingFieldArray("emergencyContacts"),
  dirty: useOnboardingIsDirty("emergencyContacts"),
  valid: useOnboardingIsValid("emergencyContacts"),
});

const ContactRow = ({
  index,
  onRemove,
}: Readonly<{ index: number; onRemove: () => void }>) => {
  const name = useOnboardingField(`emergencyContacts.${index}.name`);
  const relationship = useOnboardingField(
    `emergencyContacts.${index}.relationship`,
  );
  const phone = useOnboardingField(`emergencyContacts.${index}.phone`);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
      <TextField label="Name" {...muiTextFieldProps(name)} />
      <TextField label="Relationship" {...muiTextFieldProps(relationship)} />
      <TextField label="Phone" type="tel" {...muiTextFieldProps(phone)} />
      <IconButton aria-label="Remove contact" onClick={onRemove} sx={{ mt: 1 }}>
        <DeleteIcon />
      </IconButton>
    </Stack>
  );
};

export const EmergencyContactsSection = ({
  initiallyOpen = false,
}: EmergencyContactsSectionProps) => {
  const { contacts, dirty, valid } = useEmergencyContactsSection();
  return (
    <Accordion defaultExpanded={initiallyOpen} disableGutters variant="outlined">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <span>Emergency contacts</span>
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
          {contacts.fields.map((entry, index) => (
            <ContactRow
              key={entry.id}
              index={index}
              onRemove={() => contacts.remove(index)}
            />
          ))}
          {contacts.error ? (
            <Typography color="error" variant="body2">
              {contacts.error[0]}
            </Typography>
          ) : null}
          <Button
            startIcon={<AddIcon />}
            sx={{ alignSelf: "flex-start" }}
            onClick={() =>
              contacts.push({ name: "", relationship: "", phone: "" })
            }
          >
            Add contact
          </Button>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
