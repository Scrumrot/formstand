import { textInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type PostalCodeFieldProps = Readonly<{ label?: string }>;

export const usePostalCodeField = () => useOnboardingField("address.postalCode");

export const PostalCodeField = ({ label = "Postal code" }: PostalCodeFieldProps) => {
  const field = usePostalCodeField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input inputMode="numeric" {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
