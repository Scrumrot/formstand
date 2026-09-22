import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type FirstNameFieldProps = Readonly<{ label?: string }>;

export const useFirstNameField = () => useOnboardingField("personal.firstName");

export const FirstNameField = ({ label = "First name" }: FirstNameFieldProps) => {
  const field = useFirstNameField();
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input id={field.path} {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
