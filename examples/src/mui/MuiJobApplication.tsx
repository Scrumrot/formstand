import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  FormHelperText,
  Grid,
  InputAdornment,
  Slider,
  Snackbar,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  focusFirstError,
  useField,
  useForm,
  useIsSubmitting,
} from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";
import {
  muiNumberFieldProps,
  muiSliderProps,
  muiSwitchProps,
  muiTextFieldProps,
} from "./muiAdapter";

const SKILLS: readonly string[] = [
  "TypeScript",
  "React",
  "Node.js",
  "GraphQL",
  "Python",
  "Rust",
  "SQL",
  "Docker",
];

const TAKEN_EMAILS: ReadonlySet<string> = new Set([
  "taken@example.com",
  "admin@example.com",
]);

const SALARY_MIN = 50_000;
const SALARY_MAX = 250_000;
const SERVER_SALARY_CAP = 200_000;

const schema = z.object({
  email: z.email("valid email required").refine(
    async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return !TAKEN_EMAILS.has(value.toLowerCase());
    },
    { message: "an application with this email already exists" },
  ),
  skills: z.array(z.string()).min(1, "pick at least one skill"),
  salary: z.number().min(SALARY_MIN).max(SALARY_MAX),
  yearsExperience: z
    .int("whole years only")
    .min(0, "cannot be negative")
    .max(50, "50 years max"),
  remoteOk: z.boolean(),
});

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatUsd = (value: number): string => usd.format(value);

export const MuiJobApplication = () => {
  const form = useForm(schema, {
    initialValues: {
      email: "",
      skills: [],
      salary: 90_000,
      yearsExperience: 3,
      remoteOk: true,
    },
    mode: "onChange",
  });
  useDemoForm(form);
  // debounceMs holds the async availability check until typing pauses.
  const email = useField(form, "email", { debounceMs: 300 });
  const skills = useField(form, "skills");
  const salary = useField(form, "salary");
  const years = useField(form, "yearsExperience");
  const remoteOk = useField(form, "remoteOk");
  const isSubmitting = useIsSubmitting(form);
  const [submitted, setSubmitted] = useState(false);

  const emailProps = muiTextFieldProps(email);
  const salaryProps = muiSliderProps(salary);
  const skillsInvalid = skills.error !== undefined && skills.error.length > 0;

  return (
    <form
      onSubmit={form.handleSubmit(
        async (data) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (data.salary > SERVER_SALARY_CAP) {
            // Server-channel rejection: this error survives background
            // revalidation and only releases when the field is edited.
            form.setError(
              "salary",
              `server says: salary cap for this role is ${formatUsd(SERVER_SALARY_CAP)}`,
            );
            focusFirstError(form.getState().errors);
            return;
          }
          setSubmitted(true);
        },
        (errors) => focusFirstError(errors),
      )}
      noValidate
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The email check is an async <code>.refine</code> (600ms fake server,
        300ms debounce) — <code>taken@example.com</code> is taken. Ask for
        more than {formatUsd(SERVER_SALARY_CAP)} and the submit handler
        rejects via <code>form.setError</code>: that server error sticks
        until you move the slider again.
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Email"
            fullWidth
            autoComplete="off"
            {...emailProps}
            helperText={
              email.isValidating
                ? "checking availability..."
                : emailProps.helperText
            }
            slotProps={{
              input: {
                endAdornment: email.isValidating ? (
                  <InputAdornment position="end">
                    <CircularProgress size={18} />
                  </InputAdornment>
                ) : null,
              },
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Years of experience"
            fullWidth
            {...muiNumberFieldProps(years)}
            slotProps={{ htmlInput: { min: 0, max: 50, step: 1 } }}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Autocomplete
            multiple
            options={SKILLS}
            value={skills.value}
            onChange={(_event, value) => skills.setValue(value)}
            onBlur={skills.onBlur}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Skills"
                name={skills.path}
                error={skillsInvalid}
                helperText={
                  skills.error?.[0] ?? "the whole array is one field"
                }
              />
            )}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 8 }}>
          <Typography gutterBottom>
            Expected salary: {formatUsd(salary.value)}
          </Typography>
          <Slider
            {...salaryProps}
            min={SALARY_MIN}
            max={SALARY_MAX}
            step={5_000}
            valueLabelDisplay="auto"
            valueLabelFormat={formatUsd}
            marks={[
              { value: SALARY_MIN, label: formatUsd(SALARY_MIN) },
              { value: SALARY_MAX, label: formatUsd(SALARY_MAX) },
            ]}
          />
          {salary.error?.[0] !== undefined ? (
            <FormHelperText error>{salary.error[0]}</FormHelperText>
          ) : null}
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <FormControlLabel
            control={<Switch {...muiSwitchProps(remoteOk)} />}
            label="Open to remote"
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          type="submit"
          disabled={isSubmitting || email.isValidating}
        >
          {isSubmitting ? "Submitting..." : "Apply"}
        </Button>
      </Box>

      <Snackbar
        open={submitted}
        autoHideDuration={4000}
        onClose={() => setSubmitted(false)}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setSubmitted(false)}
        >
          Application submitted.
        </Alert>
      </Snackbar>
    </form>
  );
};
