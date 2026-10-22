"use client";

import {
  CheckboxField,
  SelectField,
  TextField,
  useForm,
  useFormActionState,
} from "formstand";
import { saveSignup } from "./actions";
import { initialSaveState, initialSignup, signupSchema } from "./schema";

// The bridge between formstand and <form action={...}>: useFormActionState
// validates with the schema BEFORE the action runs (an invalid submit
// writes field errors and marks the fields touched, the action never
// fires), tracks the pending state, and hands the action the parsed data
// spliced into React's (prevState, payload) shape. The action is the real
// guard; see actions.ts.
export const SignupForm = () => {
  const form = useForm(signupSchema, {
    initialValues: initialSignup,
    mode: "onBlur",
  });
  const [verdict, submitAction, isPending] = useFormActionState(
    form,
    saveSignup,
    initialSaveState,
  );

  return (
    <form action={submitAction}>
      <TextField form={form} path="name" label="Name" autoComplete="name" />
      <TextField
        form={form}
        path="email"
        label="Email"
        type="email"
        autoComplete="email"
      />
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

      <p className="verdict" role="status" data-status={verdict.status}>
        {verdict.message}
        {verdict.saves > 0 ? ` (${String(verdict.saves)} saved)` : ""}
      </p>

      <button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Sign up"}
      </button>
    </form>
  );
};
