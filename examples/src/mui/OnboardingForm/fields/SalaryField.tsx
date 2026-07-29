import { TextField } from "@mui/material";
import { useMuiNumberFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type SalaryFieldProps = Readonly<{ label?: string }>;

export const useSalaryField = () => useOnboardingField("employment.salary");

export const SalaryField = ({ label = "Salary (USD)" }: SalaryFieldProps) => {
  const field = useSalaryField();
  const numberProps = useMuiNumberFieldProps(field);
  return <TextField fullWidth label={label} {...numberProps} />;
};
