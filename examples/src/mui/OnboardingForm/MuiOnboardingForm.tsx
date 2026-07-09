import { Box, Button, Stack, Typography } from "@mui/material";
import { useDemoForm } from "../../demo/DemoShell";
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

// The Onboarding feature module rendered through Material UI — the same
// shared schema and hook architecture as the plain and shadcn variants.
// (The playground wraps this tab in MuiThemeBridge; in an app, put your
// ThemeProvider wherever it usually lives.)
export const MuiOnboardingForm = () => {
  useDemoForm(onboardingForm);
  const isDirty = useOnboardingIsDirty();
  const isValid = useOnboardingIsValid();
  const submitting = useOnboardingIsSubmitting();

  return (
    <Box
      component="form"
      onSubmit={onboardingForm.handleSubmit((data) => {
        window.alert(`welcome aboard, ${data.personal.firstName}!`);
      })}
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Sections are Accordions whose header chips are the path-scoped{" "}
        <code>useOnboardingIsDirty("personal")</code> /{" "}
        <code>useOnboardingIsValid("personal")</code> flags.
      </Typography>
      <Stack spacing={1.5}>
        <PersonalSection />
        <AddressSection />
        <EmploymentSection />
        <EquipmentSection />
        <EmergencyContactsSection />
      </Stack>
      <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: "center" }}>
        <Button type="submit" variant="contained" disabled={submitting}>
          Complete onboarding
        </Button>
        <Button
          variant="outlined"
          disabled={!isDirty}
          onClick={() => onboardingForm.reset()}
        >
          Reset
        </Button>
        <Typography variant="body2" color="text.secondary">
          {isDirty ? "unsaved changes" : "pristine"}
          {" · "}
          {isValid ? "no errors" : "has errors"}
        </Typography>
      </Stack>
    </Box>
  );
};
