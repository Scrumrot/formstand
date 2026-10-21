import { textInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type StreetFieldProps = Readonly<{ label?: string }>;

export const useStreetField = () => useOnboardingField("address.street");

export const StreetField = ({ label = "Street" }: StreetFieldProps) => {
  const field = useStreetField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
