import { selectProps } from "formstand";
import { EMPLOYMENT_TYPE_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type EmploymentTypeFieldProps = Readonly<{ label?: string }>;

export const useEmploymentTypeField = () => useOnboardingField("employment.employmentType");

export const EmploymentTypeField = ({ label = "Employment type" }: EmploymentTypeFieldProps) => {
  const field = useEmploymentTypeField();
  return (
    <div className="field">
      <label>{label}</label>
      <select {...selectProps(field)}>
        <option value="">Select…</option>
        {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
