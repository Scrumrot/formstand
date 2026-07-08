import { useState } from "react";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextField,
  useForm,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { z } from "zod";

const schema = z.object({
  email: z.email("valid email required"),
  password: z.string().min(8, "min 8 chars"),
  firstName: z.string().min(1, "required"),
  lastName: z.string().min(1, "required"),
  age: z.int().min(13, "must be 13+"),
  newsletter: z.boolean(),
  theme: z.enum(["light", "dark"]),
});

const STEP_PATHS = {
  0: ["email", "password"],
  1: ["firstName", "lastName", "age"],
  2: ["newsletter", "theme"],
} as const;

export const WizardForm = () => {
  const form = useForm(schema, {
    initialValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      age: 0,
      newsletter: false,
      theme: "light",
    },
    mode: "onBlur",
  });
  useDemoForm(form);
  const [step, setStep] = useState<0 | 1 | 2>(0);

  const handleNext = () => {
    // Sync schema, so validateFields settles synchronously; an async schema
    // would hand back the Promise<boolean> instead.
    if (form.validateFields(STEP_PATHS[step]) === true) {
      setStep((s) => (s + 1) as 0 | 1 | 2);
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit((data) => {
        window.alert(`signed up: ${JSON.stringify(data, null, 2)}`);
      })}
    >
      <div className="subtitle">Step {step + 1} of 3</div>

      {step === 0 ? (
        <>
          <TextField form={form} path="email" label="Email" type="email" />
          <TextField
            form={form}
            path="password"
            label="Password"
            type="password"
          />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <TextField form={form} path="firstName" label="First name" />
          <TextField form={form} path="lastName" label="Last name" />
          <NumberField form={form} path="age" label="Age" />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <CheckboxField
            form={form}
            path="newsletter"
            label="Subscribe to newsletter"
          />
          <SelectField
            form={form}
            path="theme"
            label="Theme"
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        {step > 0 ? (
          <button
            className="secondary"
            type="button"
            onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2)}
          >
            Back
          </button>
        ) : null}
        {step < 2 ? (
          <button className="primary" type="button" onClick={handleNext}>
            Next
          </button>
        ) : (
          <button className="primary" type="submit">
            Submit
          </button>
        )}
      </div>
    </form>
  );
};
