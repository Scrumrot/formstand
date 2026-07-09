import { selectProps } from "formstand";
import { REGION_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type RegionFieldProps = Readonly<{ label?: string }>;

export const useRegionField = () => useOnboardingField("address.region");

export const RegionField = ({ label = "Region" }: RegionFieldProps) => {
  const field = useRegionField();
  return (
    <div className="field">
      <label>{label}</label>
      <select {...selectProps(field)}>
        <option value="">Select…</option>
        {REGION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
