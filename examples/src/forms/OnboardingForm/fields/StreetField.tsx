import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type StreetFieldProps = Readonly<{ label?: string }>;

export const useStreetField = () => useOnboardingField("address.street");

export const StreetField = ({ label = "Street" }: StreetFieldProps) => {
  const field = useStreetField();
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input id={field.path} {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
