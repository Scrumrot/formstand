import {
  textInputProps,
  checkboxProps,
  useField,
  useFormSteps,
  useForm,
  useIsSubmitting,
  type UseFieldReturn,
} from "formstand";
import { useState } from "react";
import { useDemoForm } from "../demo/DemoShell";
import { z } from "zod";

// The multi-step story: ONE form and one schema behind a wizard.
// useFormSteps gates next() on the current step's fields validating
// clean (the confirm-password refine fires inside step 1), back() never
// validates, and the step headers are plain goTo() calls — a forward
// jump lands on the first step that fails instead of skipping past it.

const schema = z
  .object({
    email: z.string().email("not an email"),
    password: z.string().min(8, "at least 8 characters"),
    confirm: z.string(),
    city: z.string().min(1, "required"),
    agree: z.boolean().refine((v) => v, "you must agree"),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm) {
      ctx.addIssue({
        code: "custom",
        path: ["confirm"],
        message: "passwords must match",
      });
    }
  });

const STEPS = [
  { name: "Account", fields: ["email", "password", "confirm"] },
  { name: "Shipping", fields: ["city"] },
  { name: "Review", fields: ["agree"] },
] as const;

const Field = ({
  label,
  field,
  type,
}: Readonly<{
  label: string;
  field: UseFieldReturn<string>;
  type?: string;
}>) => (
  <div className="field">
    <label>{label}</label>
    <input type={type ?? "text"} {...textInputProps(field)} />
    <span className="error">
      {field.touched ? (field.firstError ?? " ") : " "}
    </span>
  </div>
);

export const WizardForm = () => {
  const form = useForm(schema, {
    initialValues: {
      email: "",
      password: "",
      confirm: "",
      city: "",
      agree: false,
    },
  });
  useDemoForm(form);
  const wizard = useFormSteps(form, STEPS);
  const email = useField(form, "email");
  const password = useField(form, "password");
  const confirm = useField(form, "confirm");
  const city = useField(form, "city");
  const agree = useField(form, "agree");
  const isSubmitting = useIsSubmitting(form);
  const [submitted, setSubmitted] = useState<string | null>(null);

  return (
    <form
      onSubmit={form.handleSubmit((data) => {
        setSubmitted(`${data.email} shipping to ${data.city}`);
      })}
    >
      <p className="subtitle">
        One form, one schema, three steps. Next validates only the current
        step (try mismatched passwords); the headers jump with{" "}
        <code>goTo</code> and land on the first invalid step.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {wizard.steps.map((s, i) => (
          <button
            key={s.name}
            type="button"
            className={i === wizard.step ? "primary" : ""}
            onClick={() => void wizard.goTo(i)}
          >
            {s.name}
            {s.hasErrors ? " !" : s.visited && i !== wizard.step ? " ✓" : ""}
          </button>
        ))}
      </div>

      {wizard.step === 0 && (
        <>
          <Field label="Email" field={email} />
          <Field label="Password" field={password} type="password" />
          <Field label="Confirm password" field={confirm} type="password" />
        </>
      )}
      {wizard.step === 1 && <Field label="City" field={city} />}
      {wizard.step === 2 && (
        <div className="field">
          <label>
            <input {...checkboxProps(agree)} /> I agree to the terms
          </label>
          <span className="error">
            {agree.touched ? (agree.firstError ?? " ") : " "}
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {!wizard.isFirst && (
          <button type="button" onClick={wizard.back}>
            Back
          </button>
        )}
        {wizard.isLast ? (
          <button className="primary" type="submit" disabled={isSubmitting}>
            Submit
          </button>
        ) : (
          <button
            className="primary"
            type="button"
            onClick={() => void wizard.next()}
          >
            Next
          </button>
        )}
      </div>

      {submitted !== null ? (
        <p className="subtitle" style={{ marginTop: 12 }}>
          Submitted: {submitted}
        </p>
      ) : null}
    </form>
  );
};
