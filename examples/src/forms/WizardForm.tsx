import { useState } from "react";
import {
  type FieldFormApi,
  checkboxProps,
  numberInputProps,
  selectProps,
  textInputProps,
  useField,
  useForm,
} from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const schema = z.object({
  email: z.string().email("valid email required"),
  password: z.string().min(8, "min 8 chars"),
  firstName: z.string().min(1, "required"),
  lastName: z.string().min(1, "required"),
  age: z.number().int().min(13, "must be 13+"),
  newsletter: z.boolean(),
  theme: z.enum(["light", "dark"]),
});

const STEP_PATHS = {
  0: ["email", "password"],
  1: ["firstName", "lastName", "age"],
  2: ["newsletter", "theme"],
} as const satisfies Record<number, readonly string[]>;

type TextFieldProps = Readonly<{
  form: FieldFormApi;
  path: string;
  label: string;
  type?: string;
}>;

const TextField = ({ form, path, label, type }: TextFieldProps) => {
  const field = useField<string>(form, path);
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};

const NumberField = ({
  form,
  path,
  label,
}: Readonly<{ form: FieldFormApi; path: string; label: string }>) => {
  const field = useField<number | undefined>(form, path);
  return (
    <div className="field">
      <label>{label}</label>
      <input {...numberInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};

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
  const [step, setStep] = useState<0 | 1 | 2>(0);

  const handleNext = () => {
    if (form.validateFields(STEP_PATHS[step])) {
      setStep((s) => (s + 1) as 0 | 1 | 2);
    }
  };

  const newsletter = useField(form, "newsletter");
  const theme = useField(form, "theme");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`signed up: ${JSON.stringify(data, null, 2)}`);
        });
      }}
    >
      <div className="subtitle">Step {step + 1} of 3</div>

      {step === 0 ? (
        <>
          <TextField form={form} path="email" label="Email" />
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
          <div className="field">
            <label>
              <input {...checkboxProps(newsletter)} /> Subscribe to newsletter
            </label>
          </div>
          <div className="field">
            <label>Theme</label>
            <select {...selectProps(theme)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
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

      <StateDump form={form} />
    </form>
  );
};
