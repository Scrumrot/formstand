import { textInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type PreferredNameFieldProps = Readonly<{ label?: string }>;

export const usePreferredNameField = () => useOnboardingField("personal.preferredName");

export const PreferredNameField = ({ label = "Preferred name (optional)" }: PreferredNameFieldProps) => {
  const field = usePreferredNameField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
