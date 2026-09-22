import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type PreferredNameFieldProps = Readonly<{ label?: string }>;

export const usePreferredNameField = () => useOnboardingField("personal.preferredName");

export const PreferredNameField = ({ label = "Preferred name (optional)" }: PreferredNameFieldProps) => {
  const field = usePreferredNameField();
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input id={field.path} {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
