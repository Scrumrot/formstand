import { TextField } from "@mui/material";
import { muiNumberFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type SalaryFieldProps = Readonly<{ label?: string }>;

export const useSalaryField = () => useOnboardingField("employment.salary");

export const SalaryField = ({ label = "Salary (USD)" }: SalaryFieldProps) => {
  const field = useSalaryField();
  return <TextField fullWidth label={label} {...muiNumberFieldProps(field)} />;
};
