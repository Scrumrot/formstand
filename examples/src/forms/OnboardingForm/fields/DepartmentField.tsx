import { selectProps } from "formstand";
import { DEPARTMENT_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type DepartmentFieldProps = Readonly<{ label?: string }>;

export const useDepartmentField = () => useOnboardingField("employment.department");

export const DepartmentField = ({ label = "Department" }: DepartmentFieldProps) => {
  const field = useDepartmentField();
  return (
    <div className="field">
      <label>{label}</label>
      <select {...selectProps(field)}>
        <option value="">Select…</option>
        {DEPARTMENT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
