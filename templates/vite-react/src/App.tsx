import {
  CheckboxField,
  NumberField,
  SelectField,
  TextField,
  focusFirstError,
  useForm,
  useIsSubmitting,
} from "formstand";
import { initialSignup, signupSchema } from "./schema";

// One form, written by hand with the bound components. Each component wires
// its label, name, aria-invalid, aria-describedby and the error line; the
// schema supplies the types, the validation and the typed paths. For the
// generated equivalent run `npm run generate`, which writes SignupForm.tsx
// from the same schema through formstand-cli.
export const App = () => {
  const form = useForm(signupSchema, {
    initialValues: initialSignup,
    mode: "onBlur",
  });
  const isSubmitting = useIsSubmitting(form);

  return (
    <main className="page">
      <h1>Sign up</h1>
      <p className="lede">
        A formstand starter: the schema in <code>src/schema.ts</code> drives
        this form. Change a rule there and the field below follows.
      </p>
      <form
        className="form"
        onSubmit={form.handleSubmit(
          async (data) => {
            // Replace with your request. `data` is the schema's output type.
            await new Promise((resolve) => setTimeout(resolve, 400));
            window.alert(`signed up: ${JSON.stringify(data, null, 2)}`);
          },
          (errors) => focusFirstError(errors),
        )}
      >
        <TextField form={form} path="name" label="Name" autoComplete="name" />
        <TextField
          form={form}
          path="email"
          label="Email"
          type="email"
          autoComplete="email"
        />
        <NumberField form={form} path="seats" label="Seats" />
        <SelectField
          form={form}
          path="plan"
          label="Plan"
          options={[
            { value: "starter", label: "Starter" },
            { value: "pro", label: "Pro" },
            { value: "enterprise", label: "Enterprise" },
          ]}
        />
        <CheckboxField form={form} path="terms" label="I accept the terms" />
        <div className="actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing up..." : "Sign up"}
          </button>
          <button type="button" className="secondary" onClick={() => form.reset()}>
            Reset
          </button>
        </div>
      </form>
    </main>
  );
};
