import { numberInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type SalaryFieldProps = Readonly<{ label?: string }>;

export const useSalaryField = () => useOnboardingField("employment.salary");

export const SalaryField = ({ label = "Salary (USD)" }: SalaryFieldProps) => {
  const field = useSalaryField();
  return (
    <div className="field">
      <label>{label}</label>
      <input {...numberInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
