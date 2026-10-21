import { textInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type FirstNameFieldProps = Readonly<{ label?: string }>;

export const useFirstNameField = () => useOnboardingField("personal.firstName");

export const FirstNameField = ({ label = "First name" }: FirstNameFieldProps) => {
  const field = useFirstNameField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
