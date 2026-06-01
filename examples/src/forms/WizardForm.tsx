import { useState } from "react";
import { type FieldFormApi, useField, useForm } from "zustand-forms";
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

const TextField = ({ form, path, label, type = "text" }: TextFieldProps) => {
  const field = useField<string>(form, path);
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={field.value ?? ""}
        onChange={(e) => field.setValue(e.target.value)}
        onBlur={field.onBlur}
      />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};

type NumberFieldProps = Readonly<{
  form: FieldFormApi;
  path: string;
  label: string;
}>;

const NumberField = ({ form, path, label }: NumberFieldProps) => {
  const field = useField<number | undefined>(form, path);
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={field.value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          field.setValue(raw === "" ? undefined : Number(raw));
        }}
        onBlur={field.onBlur}
      />
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

  const validateCurrentStep = (): boolean => {
    const paths = STEP_PATHS[step];
    const results = paths.map((p) => form.validateField(p));
    return results.every((r) => r.kind === "valid");
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setStep((s) => (s + 1) as 0 | 1 | 2);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void form.submit((data) => {
      window.alert(`signed up: ${JSON.stringify(data, null, 2)}`);
    });
  };

  const newsletter = useField<boolean>(form, "newsletter");
  const theme = useField<"light" | "dark">(form, "theme");

  return (
    <form onSubmit={handleSubmit}>
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
              <input
                type="checkbox"
                checked={newsletter.value ?? false}
                onChange={(e) => newsletter.setValue(e.target.checked)}
              />
              {" "}Subscribe to newsletter
            </label>
          </div>
          <div className="field">
            <label>Theme</label>
            <select
              value={theme.value ?? "light"}
              onChange={(e) =>
                theme.setValue(e.target.value as "light" | "dark")
              }
            >
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
