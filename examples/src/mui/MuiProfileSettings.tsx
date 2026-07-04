import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  type Form,
  useField,
  useForm,
  useFormSelectorShallow,
  useIsDirty,
  useIsValid,
} from "formstand";
import { z } from "zod";
import {
  muiSelectProps,
  muiSwitchProps,
  muiTextFieldProps,
} from "./muiAdapter";

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

const schema = z.object({
  displayName: z.string().min(1, "display name required"),
  // Nullable on purpose: "no bio" is null, not "". Clearing the text field
  // writes null back via field.emptyValue.
  bio: z.string().max(160, "160 chars max").nullable(),
  theme: z.enum(["system", "light", "dark"]),
  notifications: z.object({
    email: z.boolean(),
    push: z.boolean(),
    weeklyDigest: z.boolean(),
  }),
});

type Schema = typeof schema;

// The chips row gets its own shallow selector: dirtyFields() builds a fresh
// array per call, so it must be the selector's direct result (compared
// element-wise by useShallow), never a property of a composite selector
// object.
const DirtyChips = ({ form }: Readonly<{ form: Form<Schema> }>) => {
  const dirtyPaths = useFormSelectorShallow(form, () => form.dirtyFields());

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Unsaved changes ({dirtyPaths.length})
      </Typography>
      {dirtyPaths.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Everything matches the last saved state.
        </Typography>
      ) : (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {dirtyPaths.map((path) => (
            <Chip
              key={path}
              label={path}
              size="small"
              color="warning"
              variant="outlined"
            />
          ))}
        </Stack>
      )}
    </Box>
  );
};

export const MuiProfileSettings = () => {
  const form = useForm(schema, {
    initialValues: {
      displayName: "Tim",
      bio: null,
      theme: "system",
      notifications: { email: true, push: false, weeklyDigest: true },
    },
    mode: "onChange",
  });
  const displayName = useField(form, "displayName");
  const bio = useField(form, "bio");
  const theme = useField(form, "theme");
  const emailNotif = useField(form, "notifications.email");
  const pushNotif = useField(form, "notifications.push");
  const digestNotif = useField(form, "notifications.weeklyDigest");
  const isDirty = useIsDirty(form);
  const isValid = useIsValid(form);
  const [saved, setSaved] = useState(false);

  const themeProps = muiSelectProps(theme);
  const bioText =
    bio.value === null ? "null" : JSON.stringify(bio.value);

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Save is gated on <code>useIsDirty && useIsValid</code>; the chips
        below are <code>form.dirtyFields()</code> live. Saving calls{" "}
        <code>adoptValues</code> (rebase, not reset) — Discard calls{" "}
        <code>reset()</code> back to the last saved state.
      </Typography>

      <DirtyChips form={form} />

      <Stack spacing={2}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Profile
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Display name"
                fullWidth
                {...muiTextFieldProps(displayName)}
              />
              <TextField
                label="Bio"
                fullWidth
                multiline
                minRows={2}
                {...muiTextFieldProps(bio)}
                helperText={
                  bio.error?.[0] ??
                  `bio is a nullable field — its store value is ${bioText}. ` +
                    "Clear the text and it round-trips to null " +
                    "(field.emptyValue), not an empty string."
                }
              />
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Preferences
            </Typography>
            <FormControl sx={{ minWidth: 220, mb: 1 }} error={themeProps.error}>
              <InputLabel id="settings-theme-label">Theme</InputLabel>
              <Select
                labelId="settings-theme-label"
                label="Theme"
                {...themeProps}
              >
                {THEMES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
              {theme.error?.[0] !== undefined ? (
                <FormHelperText>{theme.error[0]}</FormHelperText>
              ) : null}
            </FormControl>
            <Box>
              <FormControlLabel
                control={<Switch {...muiSwitchProps(emailNotif)} />}
                label="Email notifications"
              />
              <FormControlLabel
                control={<Switch {...muiSwitchProps(pushNotif)} />}
                label="Push notifications"
              />
              <FormControlLabel
                control={<Switch {...muiSwitchProps(digestNotif)} />}
                label="Weekly digest"
              />
            </Box>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderColor: "error.main" }}>
          <CardContent>
            <Typography variant="h6" color="error" gutterBottom>
              Danger zone
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Throw away every unsaved change and return to the last saved
              state.
            </Typography>
            <Button
              variant="outlined"
              color="error"
              disabled={!isDirty}
              onClick={() => form.reset()}
            >
              Discard changes
            </Button>
          </CardContent>
        </Card>
      </Stack>

      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          disabled={!isDirty || !isValid}
          onClick={() =>
            void form.handleSubmit(() => {
              form.adoptValues(form.getState().values);
              setSaved(true);
            })()
          }
        >
          Save settings
        </Button>
      </Box>

      <Snackbar
        open={saved}
        autoHideDuration={4000}
        onClose={() => setSaved(false)}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setSaved(false)}
        >
          Settings saved — the dirty chips are gone until the next edit.
        </Alert>
      </Snackbar>
    </Box>
  );
};
