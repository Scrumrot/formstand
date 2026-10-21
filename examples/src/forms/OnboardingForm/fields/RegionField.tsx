import { selectProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { REGION_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type RegionFieldProps = Readonly<{ label?: string }>;

export const useRegionField = () => useOnboardingField("address.region");

export const RegionField = ({ label = "Region" }: RegionFieldProps) => {
  const field = useRegionField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <select {...selectProps(field)} {...a11y.control}>
        <option value="">Select…</option>
        {REGION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
