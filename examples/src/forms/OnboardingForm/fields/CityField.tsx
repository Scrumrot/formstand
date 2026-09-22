import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type CityFieldProps = Readonly<{ label?: string }>;

export const useCityField = () => useOnboardingField("address.city");

export const CityField = ({ label = "City" }: CityFieldProps) => {
  const field = useCityField();
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input id={field.path} {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
