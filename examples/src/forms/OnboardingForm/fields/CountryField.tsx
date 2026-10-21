import { selectProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { COUNTRY_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type CountryFieldProps = Readonly<{ label?: string }>;

export const useCountryField = () => useOnboardingField("address.country");

export const CountryField = ({ label = "Country" }: CountryFieldProps) => {
  const field = useCountryField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <select {...selectProps(field)} {...a11y.control}>
        <option value="">Select…</option>
        {COUNTRY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
