import { selectProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { EMPLOYMENT_TYPE_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type EmploymentTypeFieldProps = Readonly<{ label?: string }>;

export const useEmploymentTypeField = () => useOnboardingField("employment.employmentType");

export const EmploymentTypeField = ({ label = "Employment type" }: EmploymentTypeFieldProps) => {
  const field = useEmploymentTypeField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <select {...selectProps(field)} {...a11y.control}>
        <option value="">Select…</option>
        {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
