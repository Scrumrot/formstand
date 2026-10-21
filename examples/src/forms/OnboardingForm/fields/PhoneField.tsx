import { textInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type PhoneFieldProps = Readonly<{ label?: string }>;

export const usePhoneField = () => useOnboardingField("personal.phone");

export const PhoneField = ({ label = "Phone" }: PhoneFieldProps) => {
  const field = usePhoneField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input type="tel" {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
