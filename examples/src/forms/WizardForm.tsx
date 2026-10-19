import {
  textInputProps,
  checkboxProps,
  focusFirstError,
  useField,
  useFormSteps,
  useForm,
  useIsSubmitting,
  type UseFieldReturn,
} from "formstand";
import { useState } from "react";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "../demo/fieldA11y";
import { z } from "zod";

// The multi-step story: ONE form and one schema behind a wizard.
// useFormSteps gates next() on the current step's fields validating
// clean (the confirm-password refine fires inside step 1), back() never
// validates, and the step headers are plain goTo() calls; a forward
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
}>) => {
  // The message shows only once touched (the wizard validates on next()),
  // so the aria wiring follows the SHOWN message, not the raw error: a
  // description pointing at a blank line would announce nothing useful.
  const shown = field.touched ? field.error : undefined;
  const a11y = fieldA11y({ error: shown }, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input type={type ?? "text"} {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{shown?.[0] ?? " "}</span>
    </div>
  );
};

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
  const agreeShown = agree.touched ? agree.error : undefined;
  const agreeA11y = fieldA11y({ error: agreeShown }, agree.path);

  return (
    <form
      onSubmit={form.handleSubmit(
        (data) => {
          setSubmitted(`${data.email} shipping to ${data.city}`);
        },
        (errors) => {
          focusFirstError(errors);
        },
      )}
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
            <input {...checkboxProps(agree)} {...agreeA11y.control} /> I agree
            to the terms
          </label>
          <span {...agreeA11y.message}>{agreeShown?.[0] ?? " "}</span>
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
        <p className="subtitle" role="status" style={{ marginTop: 12 }}>
          Submitted: {submitted}
        </p>
      ) : null}
    </form>
  );
};
