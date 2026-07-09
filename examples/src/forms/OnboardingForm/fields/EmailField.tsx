import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type EmailFieldProps = Readonly<{ label?: string }>;

export const useEmailField = () => useOnboardingField("personal.email");

export const EmailField = ({ label = "Personal email" }: EmailFieldProps) => {
  const field = useEmailField();
  return (
    <div className="field">
      <label>{label}</label>
      <input type="email" {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
