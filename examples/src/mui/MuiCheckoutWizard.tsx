import { type FormEvent, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  type Form,
  focusFirstError,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";
import {
  muiSelectProps,
  muiSwitchProps,
  muiTextFieldProps,
} from "./muiAdapter";

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
] as const;

const addressSchema = z.object({
  street: z.string().min(1, "street required"),
  city: z.string().min(1, "city required"),
  postalCode: z.string().min(3, "postal code required"),
  country: z.enum(["US", "CA", "GB", "DE"]),
});

const schema = z.object({
  contact: z.object({
    fullName: z.string().min(1, "name required"),
    email: z.email("valid email required"),
  }),
  shipping: addressSchema,
  billingSameAsShipping: z.boolean(),
  billing: addressSchema,
  payment: z.object({
    cardNumber: z.string().regex(/^\d{16}$/, "card number is 16 digits"),
    expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d\d$/, "use MM/YY"),
    cvc: z.string().regex(/^\d{3,4}$/, "3 or 4 digits"),
  }),
});

type Schema = typeof schema;
type Values = z.input<Schema>;
type Address = Values["shipping"];

const EMPTY_ADDRESS: Address = {
  street: "",
  city: "",
  postalCode: "",
  country: "US",
};

const STEP_LABELS = ["Contact & shipping", "Payment", "Review"] as const;

const CONTACT_SHIPPING_PATHS = [
  "contact.fullName",
  "contact.email",
  "shipping.street",
  "shipping.city",
  "shipping.postalCode",
  "shipping.country",
] as const;

const BILLING_PATHS = [
  "billing.street",
  "billing.city",
  "billing.postalCode",
  "billing.country",
] as const;

const PAYMENT_PATHS = [
  "payment.cardNumber",
  "payment.expiry",
  "payment.cvc",
] as const;

const formatAddress = (address: Address): string =>
  `${address.street}, ${address.city} ${address.postalCode}, ${address.country}`;

type StepProps = Readonly<{ form: Form<Schema> }>;

type AddressFieldsProps = Readonly<{
  form: Form<Schema>;
  prefix: "shipping" | "billing";
}>;

const AddressFields = ({ form, prefix }: AddressFieldsProps) => {
  const street = useField(form, `${prefix}.street`);
  const city = useField(form, `${prefix}.city`);
  const postalCode = useField(form, `${prefix}.postalCode`);
  const country = useField(form, `${prefix}.country`);
  const countryProps = muiSelectProps(country);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
        <TextField label="Street" fullWidth {...muiTextFieldProps(street)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField label="City" fullWidth {...muiTextFieldProps(city)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField
          label="Postal code"
          fullWidth
          {...muiTextFieldProps(postalCode)}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <FormControl fullWidth error={countryProps.error}>
          <InputLabel id={`${prefix}-country-label`}>Country</InputLabel>
          <Select
            labelId={`${prefix}-country-label`}
            label="Country"
            {...countryProps}
          >
            {COUNTRIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </Select>
          {country.error?.[0] !== undefined ? (
            <FormHelperText>{country.error[0]}</FormHelperText>
          ) : null}
        </FormControl>
      </Grid>
    </Grid>
  );
};

const ContactShippingStep = ({ form }: StepProps) => {
  const fullName = useField(form, "contact.fullName");
  const email = useField(form, "contact.email");
  const billingSame = useField(form, "billingSameAsShipping");
  const billingSwitch = muiSwitchProps(billingSame);

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Full name"
            fullWidth
            {...muiTextFieldProps(fullName)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Email" fullWidth {...muiTextFieldProps(email)} />
        </Grid>
      </Grid>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Shipping address
      </Typography>
      <AddressFields form={form} prefix="shipping" />

      <FormControlLabel
        sx={{ my: 1 }}
        label="Billing address same as shipping"
        control={
          <Switch
            {...billingSwitch}
            onChange={(event, checked) => {
              billingSwitch.onChange(event, checked);
              if (checked) {
                // Copy shipping over the billing section as it unmounts, and
                // drop any errors it collected while visible.
                form.setValue("billing", form.getState().values.shipping);
                form.clearErrors("billing");
              }
            }}
          />
        }
      />

      {billingSame.value ? null : (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Billing address
          </Typography>
          <AddressFields form={form} prefix="billing" />
        </Box>
      )}
    </Box>
  );
};

const PaymentStep = ({ form }: StepProps) => {
  const cardNumber = useField(form, "payment.cardNumber");
  const expiry = useField(form, "payment.expiry");
  const cvc = useField(form, "payment.cvc");

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
        <TextField
          label="Card number"
          fullWidth
          autoComplete="off"
          {...muiTextFieldProps(cardNumber)}
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <TextField
          label="Expiry (MM/YY)"
          fullWidth
          {...muiTextFieldProps(expiry)}
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <TextField
          label="CVC"
          fullWidth
          autoComplete="off"
          {...muiTextFieldProps(cvc)}
        />
      </Grid>
    </Grid>
  );
};

// Its own component so only the Review step subscribes to every value — the
// wizard shell doesn't re-render per keystroke on earlier steps.
const ReviewStep = ({ form }: StepProps) => {
  const values = useFormSelector(form, (s) => s.values);
  const rows: readonly Readonly<{ label: string; text: string }>[] = [
    { label: "Name", text: values.contact.fullName },
    { label: "Email", text: values.contact.email },
    { label: "Ships to", text: formatAddress(values.shipping) },
    {
      label: "Bills to",
      text: values.billingSameAsShipping
        ? "Same as shipping"
        : formatAddress(values.billing),
    },
    {
      label: "Card",
      text: `**** **** **** ${values.payment.cardNumber.slice(-4)} (exp ${values.payment.expiry})`,
    },
  ];

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 1 }}>
        Everything below is read straight from the store via a selector — the
        inputs from earlier steps are unmounted, the values persist.
      </Alert>
      <List dense>
        {rows.map((row) => (
          <ListItem key={row.label} disableGutters>
            <ListItemText primary={row.label} secondary={row.text} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export const MuiCheckoutWizard = () => {
  const form = useForm(schema, {
    initialValues: {
      contact: { fullName: "", email: "" },
      shipping: EMPTY_ADDRESS,
      billingSameAsShipping: true,
      billing: EMPTY_ADDRESS,
      payment: { cardNumber: "", expiry: "", cvc: "" },
    },
    mode: "onBlur",
  });
  useDemoForm(form);
  const [step, setStep] = useState(0);
  const [orderPlaced, setOrderPlaced] = useState(false);

  // Keep the hidden billing copy in sync with shipping whenever "same as
  // shipping" holds, so whole-form validation never trips on stale values
  // behind an unmounted section.
  const syncBillingCopy = () => {
    const values = form.getState().values;
    if (values.billingSameAsShipping) {
      form.setValue("billing", values.shipping);
      form.clearErrors("billing");
    }
  };

  const handleNext = async () => {
    syncBillingCopy();
    const paths =
      step === 0
        ? form.getState().values.billingSameAsShipping
          ? CONTACT_SHIPPING_PATHS
          : [...CONTACT_SHIPPING_PATHS, ...BILLING_PATHS]
        : PAYMENT_PATHS;
    // validateFields settles synchronously for sync schemas; await also
    // covers the Promise<boolean> an async schema would hand back.
    const ok = await Promise.resolve(form.validateFields(paths));
    if (ok) {
      setStep((s) => s + 1);
    } else {
      focusFirstError(form.getState().errors);
    }
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    syncBillingCopy();
    void form.handleSubmit(
      () => setOrderPlaced(true),
      (errors) => focusFirstError(errors),
    )(event);
  };

  return (
    <form onSubmit={handleFormSubmit} noValidate>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Each step gates on <code>form.validateFields(stepPaths)</code>; the
        final submit runs the whole schema and jumps to the first offending
        input via <code>focusFirstError</code>.
      </Typography>

      <Stepper activeStep={step} sx={{ mb: 3 }}>
        {STEP_LABELS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {step === 0 ? <ContactShippingStep form={form} /> : null}
      {step === 1 ? <PaymentStep form={form} /> : null}
      {step === 2 ? <ReviewStep form={form} /> : null}

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          variant="outlined"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          Back
        </Button>
        {step < 2 ? (
          <Button variant="contained" onClick={() => void handleNext()}>
            Next
          </Button>
        ) : (
          <Button variant="contained" type="submit">
            Place order
          </Button>
        )}
      </Box>

      <Snackbar
        open={orderPlaced}
        autoHideDuration={4000}
        onClose={() => setOrderPlaced(false)}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setOrderPlaced(false)}
        >
          Order placed — the typed payload came out of handleSubmit.
        </Alert>
      </Snackbar>
    </form>
  );
};
