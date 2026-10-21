import { numberInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type SalaryFieldProps = Readonly<{ label?: string }>;

export const useSalaryField = () => useOnboardingField("employment.salary");

export const SalaryField = ({ label = "Salary (USD)" }: SalaryFieldProps) => {
  const field = useSalaryField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input {...numberInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
