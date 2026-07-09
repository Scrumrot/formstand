import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type PhoneFieldProps = Readonly<{ label?: string }>;

export const usePhoneField = () => useOnboardingField("personal.phone");

export const PhoneField = ({ label = "Phone" }: PhoneFieldProps) => {
  const field = usePhoneField();
  return (
    <div className="field">
      <label>{label}</label>
      <input type="tel" {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
