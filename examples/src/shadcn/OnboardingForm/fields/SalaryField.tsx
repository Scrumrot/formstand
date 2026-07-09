import { numberInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type SalaryFieldProps = Readonly<{ label?: string }>;

export const useSalaryField = () => useOnboardingField("employment.salary");

export const SalaryField = ({ label = "Salary (USD)" }: SalaryFieldProps) => {
  const field = useSalaryField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-employment.salary">{label}</Label>
      <Input id="onbsc-employment.salary" {...numberInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
