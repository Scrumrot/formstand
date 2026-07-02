import {
  CheckboxField,
  NumberField,
  SelectField,
  TextField,
  focusFirstError,
  useForm,
  useIsValid,
} from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const schema = z.object({
  name: z.string().min(2, "min 2 chars"),
  email: z.email("valid email required"),
  seats: z.int().min(1, "at least one seat").max(20, "20 max"),
  plan: z.enum(["starter", "pro", "enterprise"]).optional(),
  terms: z.boolean().refine((v) => v, "you must accept the terms"),
});

export const BoundFieldsForm = () => {
  const form = useForm(schema, {
    // `plan` starts undefined — SelectField stays controlled and shows the
    // placeholder option; `terms` false so useIsValid gates the button.
    initialValues: { name: "", email: "", seats: 1, terms: false },
    mode: "onBlur",
    // Errors exist from the start so the submit button can be gated on
    // useIsValid; error *display* still waits for touched via the components.
    validateOnMount: true,
  });
  const isValid = useIsValid(form);

  return (
    <form
      onSubmit={form.handleSubmit(
        (data) => {
          window.alert(`subscribed: ${JSON.stringify(data)}`);
        },
        (errors) => focusFirstError(errors),
      )}
    >
      <p className="subtitle">
        The four shipped bound components. Each wires up a label,{" "}
        <code>name</code>, <code>aria-invalid</code>,{" "}
        <code>aria-describedby</code> and a <code>role=&quot;alert&quot;</code>{" "}
        error — inspect the DOM. The submit button is gated on{" "}
        <code>useIsValid</code> (enabled by <code>validateOnMount</code>).
      </p>

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
        placeholder="Pick a plan…"
        options={[
          { value: "starter", label: "Starter" },
          { value: "pro", label: "Pro" },
          { value: "enterprise", label: "Enterprise" },
        ]}
      />
      <CheckboxField form={form} path="terms" label="I accept the terms" />

      <button className="primary" type="submit" disabled={!isValid}>
        Subscribe
      </button>

      <StateDump form={form} />
    </form>
  );
};
