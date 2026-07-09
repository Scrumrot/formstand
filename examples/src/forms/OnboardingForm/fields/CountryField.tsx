import { selectProps } from "formstand";
import { COUNTRY_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type CountryFieldProps = Readonly<{ label?: string }>;

export const useCountryField = () => useOnboardingField("address.country");

export const CountryField = ({ label = "Country" }: CountryFieldProps) => {
  const field = useCountryField();
  return (
    <div className="field">
      <label>{label}</label>
      <select {...selectProps(field)}>
        <option value="">Select…</option>
        {COUNTRY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
