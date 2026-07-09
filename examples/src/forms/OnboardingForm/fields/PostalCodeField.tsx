import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type PostalCodeFieldProps = Readonly<{ label?: string }>;

export const usePostalCodeField = () => useOnboardingField("address.postalCode");

export const PostalCodeField = ({ label = "Postal code" }: PostalCodeFieldProps) => {
  const field = usePostalCodeField();
  return (
    <div className="field">
      <label>{label}</label>
      <input inputMode="numeric" {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
